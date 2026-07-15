import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type {
  CodexThread,
  ExternalApproval,
  ProjectState,
  RuntimeStatus,
  StatusEnvelope,
  ThreadState
} from "./domain.js";
import type { GlobalSettings } from "./settings.js";
import { normalizeRuntimeStatus } from "./status.js";

const execFileAsync = promisify(execFile);

export interface CanonicalProject {
  projectId: string;
  projectRoot: string;
  identityAnchor: string;
}

function identityPath(value: string): string {
  const normalized = path.normalize(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

async function gitOutput(cwd: string, args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      timeout: 4_000,
      windowsHide: true,
      maxBuffer: 64 * 1024
    });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function canonicalizeProject(cwd: string, groupWorktrees: boolean): Promise<CanonicalProject> {
  if (!cwd || cwd.includes("\0")) throw new Error("Invalid working directory");
  if (!(await stat(cwd)).isDirectory()) throw new Error("Working directory is unavailable");
  const resolvedCwd = await realpath(cwd);
  const topLevelRaw = await gitOutput(resolvedCwd, ["rev-parse", "--show-toplevel"]);
  const projectRoot = topLevelRaw ? await realpath(topLevelRaw) : resolvedCwd;
  let identityAnchor = projectRoot;
  if (topLevelRaw && groupWorktrees) {
    const commonRaw = await gitOutput(resolvedCwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
    if (commonRaw) identityAnchor = path.resolve(projectRoot, commonRaw);
  }
  const identity = identityPath(identityAnchor);
  return {
    projectId: `sha256:${createHash("sha256").update(identity).digest("hex")}`,
    projectRoot,
    identityAnchor
  };
}

function sourceKind(thread: CodexThread): string {
  if (typeof thread.source === "string") return thread.source;
  if (thread.source && "subAgent" in thread.source) return "subAgent";
  if (thread.source && "custom" in thread.source) return "custom";
  return "unknown";
}

export function threadIsEligible(thread: CodexThread, settings: GlobalSettings): boolean {
  if (!thread.cwd) return false;
  if (thread.ephemeral && !settings.includeEphemeral) return false;
  const source = sourceKind(thread);
  if (source === "exec" && !settings.includeExecThreads) return false;
  if (source.startsWith("subAgent")) return false;
  return settings.sourceKinds.length === 0 || settings.sourceKinds.includes(source) || source === "custom";
}

function runtimeFor(thread: CodexThread): RuntimeStatus {
  return normalizeRuntimeStatus(thread.status);
}

export function projectDisplayName(thread: CodexThread, projectRoot: string): string {
  const threadName = thread.name?.replace(/\s+/g, " ").trim();
  if (threadName) return threadName;
  const preview = thread.preview.replace(/\s+/g, " ").trim();
  if (preview) return preview;
  return path.basename(projectRoot) || projectRoot || "Untitled task";
}

function attentionNeeded(thread: ThreadState): boolean {
  const workflow = thread.report?.report.workflowStatus;
  return (
    !!thread.externalApproval ||
    runtimeFor(thread.thread).activeFlags.includes("waitingOnApproval") ||
    ["needs_input", "blocked", "failed", "ready_for_review"].includes(workflow ?? "")
  );
}

export function choosePrimaryThread(threads: ThreadState[], pinnedThreadId?: string): ThreadState {
  const sorted = [...threads].sort((left, right) => {
    const score = (candidate: ThreadState): number => {
      const runtime = runtimeFor(candidate.thread);
      const workflow = candidate.report?.report.workflowStatus ?? "unknown";
      if (pinnedThreadId && candidate.thread.id === pinnedThreadId) return 10_000;
      if (runtime.activeFlags.includes("waitingOnApproval")) return 9_000;
      if (candidate.pluginTurnId) return 8_000;
      if (["needs_input", "blocked", "failed", "ready_for_review"].includes(workflow)) return 7_000;
      if (workflow !== "done") return 6_000;
      return 5_000;
    };
    return score(right) - score(left) || (right.thread.recencyAt ?? right.thread.updatedAt) - (left.thread.recencyAt ?? left.thread.updatedAt);
  });
  const primary = sorted[0];
  if (!primary) throw new Error("Cannot choose a primary thread from an empty project");
  return primary;
}

export interface BuildProjectsOptions {
  reports: Record<string, StatusEnvelope>;
  approvals: Record<string, ExternalApproval>;
  activeTurns: ReadonlyMap<string, string>;
  handoffs: Record<string, boolean>;
  pinnedThreadIds?: ReadonlySet<string>;
  now?: number;
}

export async function buildProjects(
  threads: CodexThread[],
  settings: GlobalSettings,
  options: BuildProjectsOptions
): Promise<ProjectState[]> {
  const now = options.now ?? Date.now();
  const candidates = threads.filter((thread) => threadIsEligible(thread, settings));
  const canonical = await mapWithConcurrency(candidates, 6, async (thread) => ({
    thread,
    project: await canonicalizeProject(thread.cwd, settings.groupWorktrees)
  }));
  const groups = new Map<string, ThreadState[]>();
  for (const candidate of canonical) {
    if (!candidate) continue;
    const state: ThreadState = {
      thread: candidate.thread,
      ...candidate.project,
      ...(options.reports[candidate.thread.id] ? { report: options.reports[candidate.thread.id] } : {}),
      ...(options.approvals[candidate.thread.id] ? { externalApproval: options.approvals[candidate.thread.id] } : {}),
      ...(options.activeTurns.get(candidate.thread.id) ? { pluginTurnId: options.activeTurns.get(candidate.thread.id) } : {}),
      ...(options.handoffs[candidate.thread.id] ? { handoff: true } : {})
    };
    const list = groups.get(candidate.project.projectId) ?? [];
    list.push(state);
    groups.set(candidate.project.projectId, list);
  }

  const projects: ProjectState[] = [];
  for (const states of groups.values()) {
    const pinned = states.find((item) => options.pinnedThreadIds?.has(item.thread.id));
    const primary = choosePrimaryThread(states, pinned?.thread.id);
    const runtimeStatus = runtimeFor(primary.thread);
    const recencyAt = Math.max(...states.map((item) => item.thread.recencyAt ?? item.thread.updatedAt));
    const project: ProjectState = {
      projectId: primary.projectId,
      projectRoot: primary.projectRoot,
      identityAnchor: primary.identityAnchor,
      displayName: projectDisplayName(primary.thread, primary.projectRoot),
      threads: states,
      primaryThreadId: primary.thread.id,
      runtimeStatus,
      handoff: !!primary.handoff,
      attentionCount: states.filter(attentionNeeded).length,
      recencyAt,
      ...(primary.report ? { report: primary.report } : {}),
      ...(primary.externalApproval ? { externalApproval: primary.externalApproval } : {}),
      ...(primary.pluginTurnId ? { pluginTurnId: primary.pluginTurnId } : {})
    };
    projects.push(project);
  }
  return projects.sort(compareProjects);
}

export function isUnderway(project: ProjectState, settings: GlobalSettings, now = Date.now()): boolean {
  if (project.pluginTurnId || project.externalApproval || project.runtimeStatus.activeFlags.includes("waitingOnApproval")) return true;
  const workflow = project.report?.report.workflowStatus;
  if (["working", "needs_input", "blocked", "ready_for_review", "paused", "failed"].includes(workflow ?? "")) return true;
  const ageMs = now - project.recencyAt * 1_000;
  if (workflow === "done") {
    const observed = project.report ? Date.parse(project.report.observedAt) : project.recencyAt * 1_000;
    return now - observed <= settings.doneGraceHours * 3_600_000;
  }
  return ageMs <= settings.recentHorizonDays * 86_400_000;
}

function projectPriority(project: ProjectState): number {
  const workflow = project.report?.report.workflowStatus;
  if (project.externalApproval || project.runtimeStatus.activeFlags.includes("waitingOnApproval")) return 90;
  if (workflow === "failed" || project.runtimeStatus.type === "system_error") return 80;
  if (workflow === "needs_input") return 70;
  if (workflow === "blocked") return 60;
  if (project.pluginTurnId || project.runtimeStatus.type === "active" || workflow === "working") return 50;
  if (workflow === "ready_for_review") return 40;
  if (workflow === "paused") return 30;
  return 10;
}

export function compareProjects(left: ProjectState, right: ProjectState): number {
  return projectPriority(right) - projectPriority(left) || right.recencyAt - left.recencyAt;
}

async function mapWithConcurrency<T, U>(items: T[], limit: number, mapper: (item: T) => Promise<U>): Promise<Array<U | undefined>> {
  const results: Array<U | undefined> = new Array(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      const item = items[index];
      if (item === undefined) continue;
      try {
        results[index] = await mapper(item);
      } catch {
        results[index] = undefined;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
