export type ConnectionState = "starting" | "connected" | "error";
export type KeyStatus = "unassigned" | "idle" | "thinking" | "complete" | "waiting" | "error";
export type LocalActivity = "idle" | "thinking" | "complete" | "error";

export interface ThreadStatus {
  type: string;
  activeFlags?: string[];
}

export interface CodexThread {
  id: string;
  name?: string | null;
  preview?: string;
  cwd?: string;
  updatedAt?: number;
  recencyAt?: number | null;
  status?: ThreadStatus;
  path?: string;
}

export type KeySettings = {
  threadId?: string;
  displayName?: string;
} & JsonObject;

export type GlobalSettings = {
  codexPath?: string;
  activeThreadId?: string;
  completionEmailEnabled?: boolean;
  completionEmailSender?: string;
  completionEmailRecipient?: string;
} & JsonObject;

export interface CompletionEmailStats {
  project?: string | undefined;
  model?: string | undefined;
  effort?: string | undefined;
  speed?: string | undefined;
  usageRemaining?: number | undefined;
  completedAt?: string | undefined;
}

export interface StatusView {
  status: KeyStatus;
  label: string;
  color: string;
  foreground: string;
  flashing: boolean;
}

export interface RateLimitWindow {
  usedPercent: number;
  windowDurationMins?: number | null;
  resetsAt?: number | null;
}

export interface RateLimitSnapshot {
  primary?: RateLimitWindow | null;
  secondary?: RateLimitWindow | null;
}

export interface RateLimitsResponse {
  rateLimits: RateLimitSnapshot;
  rateLimitsByLimitId?: Record<string, RateLimitSnapshot> | null;
}

export interface ThreadRuntimeSettings {
  model: string;
  serviceTier: string | null;
  reasoningEffort: string | null;
}
import type { JsonObject } from "@elgato/utils";
