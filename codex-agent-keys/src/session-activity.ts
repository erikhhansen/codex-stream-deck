import { open, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { LocalActivity } from "./types.js";

const MAX_TAIL_BYTES = 256 * 1024;
const COMPLETE_MILLISECONDS = 15_000;
const MAX_ACTIVE_MILLISECONDS = 12 * 60 * 60 * 1_000;
const RECENT_AGENT_ACTIVITY_MILLISECONDS = 5 * 60 * 1_000;
const AGENT_ACTIVITY_TYPES = new Set([
  "agent_message",
  "agent_reasoning",
  "custom_tool_call",
  "custom_tool_call_output",
  "patch_apply_begin",
  "patch_apply_end",
  "reasoning",
  "web_search_begin",
  "web_search_end"
]);

interface LifecycleEvent {
  type: string;
  at: number;
}

export function didFinishWork(previous: LocalActivity | undefined, next: LocalActivity): boolean {
  return previous === "thinking" && next === "complete";
}

export function activityFromJsonl(text: string, now = Date.now()): LocalActivity | undefined {
  let latest: LifecycleEvent | undefined;
  let latestAgentActivityAt: number | undefined;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line) as { timestamp?: unknown; payload?: { type?: unknown } };
      const type = event.payload?.type;
      if (typeof type !== "string") continue;
      const at = typeof event.timestamp === "string" ? Date.parse(event.timestamp) : Number.NaN;
      if (["task_started", "task_complete", "task_failed", "turn_aborted"].includes(type)) {
        latest = { type, at: Number.isFinite(at) ? at : now };
      } else if (AGENT_ACTIVITY_TYPES.has(type) && Number.isFinite(at)) {
        latestAgentActivityAt = at;
      }
    } catch {
      // A partial first line is expected when reading only the tail of a large JSONL file.
    }
  }
  if (!latest) {
    if (latestAgentActivityAt === undefined) return undefined;
    return now - latestAgentActivityAt <= RECENT_AGENT_ACTIVITY_MILLISECONDS ? "thinking" : "idle";
  }
  if (latest.type === "task_failed" || latest.type === "turn_aborted") return "error";
  if (latest.type === "task_started") return now - latest.at <= MAX_ACTIVE_MILLISECONDS ? "thinking" : "idle";
  return now - latest.at <= COMPLETE_MILLISECONDS ? "complete" : "idle";
}

export async function readSessionActivity(filePath: string, now = Date.now()): Promise<LocalActivity | undefined> {
  const resolved = path.resolve(filePath);
  const sessionsRoot = `${path.join(os.homedir(), ".codex", "sessions")}${path.sep}`;
  if (!resolved.startsWith(sessionsRoot) || !resolved.endsWith(".jsonl")) return undefined;
  const info = await stat(resolved);
  if (!info.isFile()) return undefined;
  const length = Math.min(info.size, MAX_TAIL_BYTES);
  const offset = Math.max(0, info.size - length);
  const handle = await open(resolved, "r");
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, offset);
    let text = buffer.toString("utf8");
    if (offset > 0) text = text.slice(Math.max(0, text.indexOf("\n") + 1));
    return activityFromJsonl(text, now);
  } finally {
    await handle.close();
  }
}
