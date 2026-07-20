import { execFile } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type MergeGateState =
  | "NO TARGET"
  | "NO REPO"
  | "CONFLICT"
  | "DIRTY"
  | "DETACHED"
  | "NO PR"
  | "STALE"
  | "DRAFT"
  | "CHANGES"
  | "CI FAIL"
  | "CI"
  | "REVIEW"
  | "BEHIND"
  | "BLOCKED"
  | "UNKNOWN"
  | "MERGEABLE";

export interface MergeGateSnapshot {
  threadId: string;
  cwd?: string | undefined;
  repositoryRoot?: string | undefined;
  branch?: string | undefined;
  head?: string | undefined;
  state: MergeGateState;
  count: number;
  blockerCount: number;
  label: string;
  detail: string;
  prUrl?: string | undefined;
  evidenceUrl?: string | undefined;
  compareUrl?: string | undefined;
  checkedAt: number;
}

export interface LocalRepositoryState {
  cwd: string;
  repositoryRoot: string;
  branch: string;
  head: string;
  dirtyCount: number;
  conflictCount: number;
  remoteUrl?: string | undefined;
  repositoryUrl?: string | undefined;
}

export interface PullRequestState {
  number?: number | undefined;
  url: string;
  state: string;
  isDraft: boolean;
  mergeable: string;
  mergeStateStatus: string;
  reviewDecision: string;
  headRefOid: string;
  failedChecks: string[];
  pendingChecks: string[];
  unknownChecks: string[];
  evidenceUrl?: string | undefined;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export type CommandRunner = (command: string, args: string[], cwd: string, timeout: number) => Promise<CommandResult>;

interface Blocker {
  state: MergeGateState;
  count: number;
  detail: string;
  evidenceUrl?: string | undefined;
}

const FAILURE_STATES = new Set(["ACTION_REQUIRED", "CANCELLED", "ERROR", "FAILURE", "STARTUP_FAILURE", "TIMED_OUT"]);
const PENDING_STATES = new Set(["EXPECTED", "IN_PROGRESS", "PENDING", "QUEUED", "REQUESTED", "WAITING"]);
const SUCCESS_STATES = new Set(["NEUTRAL", "SKIPPED", "SUCCESS"]);
const CONFLICT_CODES = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);
const REMOTE_CACHE_MS = 30_000;

const defaultRunner: CommandRunner = async (command, args, cwd, timeout) => {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd,
    encoding: "utf8",
    timeout,
    maxBuffer: 1_000_000,
    windowsHide: true
  });
  return { stdout, stderr };
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function countLabel(state: MergeGateState, count: number): string {
  return count > 0 && ["DIRTY", "CI FAIL", "CI"].includes(state) ? `${state} ${count}` : state;
}

function githubRepositoryUrl(remote: string): string | undefined {
  const candidate = remote.trim().replace(/\.git$/i, "");
  const scp = candidate.match(/^git@github\.com:([^/]+\/.+)$/i);
  if (scp) return `https://github.com/${scp[1]}`;
  const ssh = candidate.match(/^ssh:\/\/git@github\.com\/([^/]+\/.+)$/i);
  if (ssh) return `https://github.com/${ssh[1]}`;
  const https = candidate.match(/^https?:\/\/github\.com\/([^/]+\/.+)$/i);
  return https ? `https://github.com/${https[1]}` : undefined;
}

function compareUrl(repositoryUrl: string | undefined, branch: string): string | undefined {
  return repositoryUrl ? `${repositoryUrl}/compare/${encodeURIComponent(branch)}?expand=1` : undefined;
}

function checkName(value: Record<string, unknown>): string {
  return text(value.name) || text(value.context) || "GitHub check";
}

function checkUrl(value: Record<string, unknown>): string | undefined {
  const candidate = text(value.detailsUrl) || text(value.targetUrl);
  return /^https:\/\//i.test(candidate) ? candidate : undefined;
}

export function parsePullRequest(value: unknown): PullRequestState {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("GitHub returned an invalid pull request");
  const record = value as Record<string, unknown>;
  const url = text(record.url);
  if (!/^https:\/\//i.test(url)) throw new Error("GitHub returned no pull request URL");
  if (typeof record.isDraft !== "boolean" || !Array.isArray(record.statusCheckRollup)) {
    throw new Error("GitHub returned an incomplete pull request");
  }
  const requiredText = [record.state, record.mergeable, record.mergeStateStatus, record.headRefOid];
  if (requiredText.some((item) => !text(item))) throw new Error("GitHub returned an incomplete pull request");
  const checks = record.statusCheckRollup;
  const failedChecks: string[] = [];
  const pendingChecks: string[] = [];
  const unknownChecks: string[] = [];
  let failedEvidenceUrl: string | undefined;
  let pendingEvidenceUrl: string | undefined;
  for (const item of checks) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      unknownChecks.push("Unknown check");
      continue;
    }
    const check = item as Record<string, unknown>;
    const conclusion = text(check.conclusion).toUpperCase();
    const status = text(check.status).toUpperCase();
    const state = text(check.state).toUpperCase();
    const outcome = conclusion || state || status;
    const name = checkName(check);
    if (FAILURE_STATES.has(outcome)) {
      failedChecks.push(name);
      failedEvidenceUrl ??= checkUrl(check);
    } else if (PENDING_STATES.has(outcome) || (!conclusion && ["IN_PROGRESS", "QUEUED", "PENDING"].includes(status))) {
      pendingChecks.push(name);
      pendingEvidenceUrl ??= checkUrl(check);
    } else if (!SUCCESS_STATES.has(outcome)) {
      unknownChecks.push(name);
    }
  }
  return {
    number: typeof record.number === "number" ? record.number : undefined,
    url,
    state: text(record.state).toUpperCase(),
    isDraft: record.isDraft === true,
    mergeable: text(record.mergeable).toUpperCase(),
    mergeStateStatus: text(record.mergeStateStatus).toUpperCase(),
    reviewDecision: text(record.reviewDecision).toUpperCase(),
    headRefOid: text(record.headRefOid),
    failedChecks,
    pendingChecks,
    unknownChecks,
    evidenceUrl: failedEvidenceUrl ?? pendingEvidenceUrl
  };
}

export function classifyMergeGate(threadId: string, local: LocalRepositoryState, pr?: PullRequestState): MergeGateSnapshot {
  const blockers: Blocker[] = [];
  const add = (state: MergeGateState, count: number, detail: string, evidenceUrl?: string): void => {
    blockers.push({ state, count, detail, evidenceUrl });
  };
  if (local.conflictCount > 0) add("CONFLICT", local.conflictCount, `${local.conflictCount} conflicted path${local.conflictCount === 1 ? "" : "s"}`);
  if (local.dirtyCount > local.conflictCount) add("DIRTY", local.dirtyCount, `${local.dirtyCount} uncommitted path${local.dirtyCount === 1 ? "" : "s"}`);
  if (!local.branch) add("DETACHED", 1, "The selected worktree has a detached HEAD");
  if (!pr) add("NO PR", 1, local.repositoryUrl ? "No open pull request for this branch" : "A GitHub remote is required");
  if (pr) {
    if (pr.state !== "OPEN") add("NO PR", 1, "There is no open pull request for this branch");
    if (pr.headRefOid !== local.head) add("STALE", 1, "The pull request head does not match the local HEAD");
    if (pr.mergeable === "CONFLICTING" || pr.mergeStateStatus === "DIRTY") add("CONFLICT", 1, "GitHub reports merge conflicts", pr.url);
    if (pr.isDraft) add("DRAFT", 1, "The pull request is still a draft", pr.url);
    if (pr.reviewDecision === "CHANGES_REQUESTED") add("CHANGES", 1, "A reviewer requested changes", pr.url);
    if (pr.failedChecks.length) add("CI FAIL", pr.failedChecks.length, `${pr.failedChecks.length} failed check${pr.failedChecks.length === 1 ? "" : "s"}`, pr.evidenceUrl);
    if (pr.pendingChecks.length) add("CI", pr.pendingChecks.length, `${pr.pendingChecks.length} pending check${pr.pendingChecks.length === 1 ? "" : "s"}`, pr.evidenceUrl);
    if (pr.reviewDecision === "REVIEW_REQUIRED") add("REVIEW", 1, "A required review is missing", pr.url);
    if (pr.mergeStateStatus === "BEHIND") add("BEHIND", 1, "The branch is behind its base branch", pr.url);
    if (["BLOCKED", "HAS_HOOKS", "UNSTABLE"].includes(pr.mergeStateStatus)) add("BLOCKED", 1, `GitHub merge state is ${pr.mergeStateStatus}`, pr.url);
    if (pr.unknownChecks.length) add("UNKNOWN", pr.unknownChecks.length, "One or more checks have an unsupported status", pr.url);
    if (!["MERGEABLE", "CONFLICTING"].includes(pr.mergeable)) add("UNKNOWN", 1, `GitHub mergeability is ${pr.mergeable || "unknown"}`, pr.url);
    if (!["CLEAN", "DIRTY", "BEHIND", "BLOCKED", "HAS_HOOKS", "UNSTABLE"].includes(pr.mergeStateStatus)) {
      add("UNKNOWN", 1, `GitHub merge state is ${pr.mergeStateStatus || "unknown"}`, pr.url);
    }
  }
  const primary = blockers[0];
  const state: MergeGateState = primary?.state ?? "MERGEABLE";
  const count = primary?.count ?? 0;
  return {
    threadId,
    cwd: local.cwd,
    repositoryRoot: local.repositoryRoot,
    branch: local.branch,
    head: local.head,
    state,
    count,
    blockerCount: blockers.length,
    label: countLabel(state, count),
    detail: primary?.detail ?? "Local worktree and GitHub pull request are mergeable",
    prUrl: pr?.url,
    evidenceUrl: primary?.evidenceUrl,
    compareUrl: compareUrl(local.repositoryUrl, local.branch),
    checkedAt: Date.now()
  };
}

export function unavailableMergeGate(threadId: string, cwd: string | undefined, state: "NO TARGET" | "NO REPO" | "UNKNOWN", detail: string): MergeGateSnapshot {
  return { threadId, cwd, state, count: 0, blockerCount: state === "NO TARGET" ? 0 : 1, label: state, detail, checkedAt: Date.now() };
}

export type MergeGateOpenTarget = { kind: "url"; value: string } | { kind: "vscode"; value: string } | undefined;

export function mergeGateOpenTarget(snapshot: MergeGateSnapshot, held = false): MergeGateOpenTarget {
  if (held) {
    const url = snapshot.prUrl ?? snapshot.compareUrl;
    return url ? { kind: "url", value: url } : undefined;
  }
  if (["CONFLICT", "DIRTY", "DETACHED"].includes(snapshot.state) && snapshot.repositoryRoot) {
    return { kind: "vscode", value: snapshot.repositoryRoot };
  }
  const url = snapshot.evidenceUrl ?? snapshot.prUrl ?? snapshot.compareUrl;
  return url ? { kind: "url", value: url } : undefined;
}

export class MergeGateService {
  readonly #run: CommandRunner;
  readonly #remoteCache = new Map<string, { at: number; pr?: PullRequestState; error?: string }>();

  constructor(run: CommandRunner = defaultRunner) {
    this.#run = run;
  }

  async inspect(threadId: string, cwd: string | undefined): Promise<MergeGateSnapshot> {
    if (!threadId) return unavailableMergeGate("", cwd, "NO TARGET", "Select an Agent Key first");
    if (!cwd) return unavailableMergeGate(threadId, cwd, "NO REPO", "The selected task has no project folder");
    try {
      const local = await this.#inspectLocal(cwd);
      if (!local.branch) return classifyMergeGate(threadId, local);
      if (!local.repositoryUrl) {
        const snapshot = classifyMergeGate(threadId, local);
        return snapshot.state === "NO PR"
          ? unavailableMergeGate(threadId, cwd, "UNKNOWN", "The repository does not have a supported GitHub remote")
          : snapshot;
      }
      const cacheKey = `${local.repositoryRoot}\0${local.branch}\0${local.head}`;
      let cached = this.#remoteCache.get(cacheKey);
      if (!cached || Date.now() - cached.at >= REMOTE_CACHE_MS) {
        cached = await this.#inspectPullRequest(local);
        this.#remoteCache.set(cacheKey, cached);
      }
      if (cached.error) {
        const localSnapshot = classifyMergeGate(threadId, local);
        if (["CONFLICT", "DIRTY", "DETACHED"].includes(localSnapshot.state)) return localSnapshot;
        return unavailableMergeGate(threadId, cwd, "UNKNOWN", cached.error);
      }
      return classifyMergeGate(threadId, local, cached.pr);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Repository inspection failed";
      const noRepo = /not a git repository|no project folder|unavailable/i.test(message);
      return unavailableMergeGate(threadId, cwd, noRepo ? "NO REPO" : "UNKNOWN", message);
    }
  }

  async #inspectLocal(cwd: string): Promise<LocalRepositoryState> {
    const candidate = cwd.trim();
    if (!candidate || candidate.includes("\0")) throw new Error("The selected task has no project folder");
    if (!(await stat(candidate).catch(() => undefined))?.isDirectory()) throw new Error("The selected task's project folder is unavailable");
    const canonicalCwd = await realpath(candidate);
    const rootResult = await this.#run("git", ["rev-parse", "--show-toplevel"], canonicalCwd, 5_000);
    const repositoryRoot = await realpath(rootResult.stdout.trim());
    const [branchResult, headResult, statusResult, remoteResult] = await Promise.all([
      this.#run("git", ["symbolic-ref", "--short", "-q", "HEAD"], repositoryRoot, 5_000).catch(() => ({ stdout: "", stderr: "" })),
      this.#run("git", ["rev-parse", "HEAD"], repositoryRoot, 5_000),
      this.#run("git", ["status", "--porcelain=v1", "--untracked-files=all"], repositoryRoot, 5_000),
      this.#run("git", ["remote", "get-url", "origin"], repositoryRoot, 5_000).catch(() => ({ stdout: "", stderr: "" }))
    ]);
    const statusLines = statusResult.stdout.split(/\r?\n/).filter(Boolean);
    const conflictCount = statusLines.filter((line) => CONFLICT_CODES.has(line.slice(0, 2)) || line.slice(0, 2).includes("U")).length;
    const remoteUrl = remoteResult.stdout.trim() || undefined;
    return {
      cwd: canonicalCwd,
      repositoryRoot,
      branch: branchResult.stdout.trim(),
      head: headResult.stdout.trim(),
      dirtyCount: statusLines.length,
      conflictCount,
      remoteUrl,
      repositoryUrl: remoteUrl ? githubRepositoryUrl(remoteUrl) : undefined
    };
  }

  async #inspectPullRequest(local: LocalRepositoryState): Promise<{ at: number; pr?: PullRequestState; error?: string }> {
    try {
      const result = await this.#run("gh", [
        "pr", "view", "--json",
        "number,url,state,isDraft,mergeable,mergeStateStatus,reviewDecision,headRefOid,statusCheckRollup"
      ], local.repositoryRoot, 15_000);
      return { at: Date.now(), pr: parsePullRequest(JSON.parse(result.stdout)) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "GitHub inspection failed";
      if (/no pull requests found|could not resolve to a pullrequest/i.test(message)) return { at: Date.now() };
      return { at: Date.now(), error: message || "Could not inspect the GitHub pull request" };
    }
  }
}
