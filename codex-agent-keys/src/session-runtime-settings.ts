import { open, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { ThreadRuntimeSettings } from "./types.js";

const MAX_TAIL_BYTES = 4 * 1024 * 1024;
const sessionPathCache = new Map<string, string>();

export type LocalThreadRuntimeSettings = Partial<ThreadRuntimeSettings>;

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function runtimeSettingsFromJsonl(text: string): LocalThreadRuntimeSettings {
  let latest: LocalThreadRuntimeSettings = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = record(JSON.parse(line));
      if (event?.type !== "turn_context") continue;
      const payload = record(event.payload);
      if (!payload) continue;
      const next: LocalThreadRuntimeSettings = {};
      if (typeof payload.model === "string" && payload.model) next.model = payload.model;
      if (typeof payload.effort === "string" || payload.effort === null) {
        next.reasoningEffort = payload.effort as string | null;
      }
      const serviceTier = payload.service_tier ?? payload.serviceTier;
      if (typeof serviceTier === "string" || serviceTier === null) {
        next.serviceTier = serviceTier as string | null;
      } else {
        // Standard turns omit the tier field; an explicit priority turn includes it.
        next.serviceTier = null;
      }
      latest = { ...latest, ...next };
    } catch {
      // A partial first line is expected when reading only a file tail.
    }
  }
  return latest;
}

async function findSessionPath(threadId: string): Promise<string | undefined> {
  const cached = sessionPathCache.get(threadId);
  if (cached) return cached;
  const root = path.join(os.homedir(), ".codex", "sessions");
  const suffix = `-${threadId}.jsonl`;
  const visit = async (directory: string): Promise<string | undefined> => {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const candidate = path.join(directory, entry.name);
      if (entry.isFile() && entry.name.endsWith(suffix)) return candidate;
      if (entry.isDirectory()) {
        const found = await visit(candidate);
        if (found) return found;
      }
    }
    return undefined;
  };
  const found = await visit(root);
  if (found) sessionPathCache.set(threadId, found);
  return found;
}

export async function readSessionRuntimeSettings(
  threadId: string,
  filePath?: string
): Promise<LocalThreadRuntimeSettings> {
  const resolved = path.resolve(filePath ?? await findSessionPath(threadId) ?? "");
  const sessionsRoot = `${path.join(os.homedir(), ".codex", "sessions")}${path.sep}`;
  if (!resolved.startsWith(sessionsRoot) || !resolved.endsWith(`-${threadId}.jsonl`)) return {};
  const info = await stat(resolved);
  if (!info.isFile()) return {};
  const length = Math.min(info.size, MAX_TAIL_BYTES);
  const offset = Math.max(0, info.size - length);
  const handle = await open(resolved, "r");
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, offset);
    let text = buffer.toString("utf8");
    if (offset > 0) text = text.slice(Math.max(0, text.indexOf("\n") + 1));
    return runtimeSettingsFromJsonl(text);
  } finally {
    await handle.close();
  }
}
