import streamDeck from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { approvalResponse, parseApprovalRequest, type ApprovalChoice, type PendingApproval, type RpcId } from "./approval.js";
import { CodexClient } from "./codex-client.js";
import { readSessionActivity } from "./session-activity.js";
import { normalizeThreadId, requireThreadId } from "./selection.js";
import { statusFor } from "./status.js";
import type { CodexThread, ConnectionState, GlobalSettings, LocalActivity, RateLimitSnapshot, StatusView, ThreadStatus } from "./types.js";

const DEFAULT_CODEX_PATH = process.platform === "darwin" ? "/Applications/Codex.app/Contents/Resources/codex" : "codex";

class AgentKeysController {
  readonly #client = new CodexClient();
  readonly #listeners = new Set<() => void>();
  readonly #completedUntil = new Map<string, number>();
  readonly #watchedThreads = new Set<string>();
  readonly #localActivity = new Map<string, LocalActivity>();
  readonly #pendingApprovals = new Map<string, PendingApproval[]>();
  #threads: CodexThread[] = [];
  #connection: ConnectionState = "starting";
  #lastError = "";
  #codexPath = DEFAULT_CODEX_PATH;
  #activeThreadId = "";
  #rateLimits: RateLimitSnapshot | undefined;
  #usageError = "";
  #lastUsageRefreshAt = 0;
  #pollTimer: NodeJS.Timeout | undefined;
  #flashTimer: NodeJS.Timeout | undefined;
  #activityTimer: NodeJS.Timeout | undefined;
  #flashOn = true;
  #reconnectPromise: Promise<void> | undefined;
  #readingActivity = false;

  constructor() {
    this.#client.on("notification", (method: string, params: Record<string, unknown>) => this.#onNotification(method, params));
    this.#client.on("serverRequest", (id: RpcId, method: string, params: Record<string, unknown>) => {
      this.#onServerRequest(id, method, params);
    });
    this.#client.on("exit", (error: Error) => {
      this.#pendingApprovals.clear();
      this.#connection = "error";
      this.#lastError = error.message;
      this.#emit();
    });
  }

  get flashOn(): boolean {
    return this.#flashOn;
  }

  get connection(): ConnectionState {
    return this.#connection;
  }

  get activeThreadId(): string {
    return this.#activeThreadId;
  }

  get rateLimits(): RateLimitSnapshot | undefined {
    return this.#rateLimits;
  }

  get usageError(): string {
    return this.#usageError;
  }

  async start(): Promise<void> {
    const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
    this.#codexPath = this.#normalizePath(settings.codexPath);
    this.#activeThreadId = normalizeThreadId(settings.activeThreadId);
    streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((event) => {
      const next = this.#normalizePath(event.settings.codexPath);
      const nextActiveThreadId = normalizeThreadId(event.settings.activeThreadId);
      const selectionChanged = nextActiveThreadId !== this.#activeThreadId;
      this.#activeThreadId = nextActiveThreadId;
      if (next !== this.#codexPath) {
        this.#codexPath = next;
        void this.reconnect();
      }
      if (selectionChanged) this.#emit();
    });
    this.#flashTimer = setInterval(() => {
      this.#flashOn = !this.#flashOn;
      this.#emit();
    }, 650);
    this.#activityTimer = setInterval(() => void this.#refreshLocalActivity(), 1_000);
    await this.reconnect();
  }

  onChange(listener: () => void): void {
    this.#listeners.add(listener);
  }

  thread(threadId: string | undefined): CodexThread | undefined {
    return threadId ? this.#threads.find((thread) => thread.id === threadId) : undefined;
  }

  watchThread(threadId: string | undefined): void {
    if (!threadId) return;
    this.#watchedThreads.add(threadId);
    void this.#refreshLocalActivity();
  }

  isActiveThread(threadId: string | undefined): boolean {
    return !!threadId && threadId === this.#activeThreadId;
  }

  isWaitingForApproval(threadId: string): boolean {
    return (this.#pendingApprovals.get(threadId)?.length ?? 0) > 0;
  }

  respondToApproval(threadId: string, choice: ApprovalChoice): void {
    const queue = this.#pendingApprovals.get(threadId);
    const pending = queue?.[0];
    if (!pending) throw new Error("The selected task has no actionable approval request");
    const result = approvalResponse(pending, choice);
    if (!result) throw new Error(`Codex does not offer ${choice} for this request`);
    this.#client.respond(pending.id, result);
    queue.shift();
    if (queue.length === 0) this.#pendingApprovals.delete(threadId);
    this.#emit();
  }

  async selectThread(threadId: string): Promise<void> {
    const selected = requireThreadId(threadId);
    if (selected === this.#activeThreadId) return;
    const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
    this.#activeThreadId = selected;
    await streamDeck.settings.setGlobalSettings({ ...settings, activeThreadId: selected });
    this.#emit();
  }

  async clearActiveThread(): Promise<void> {
    if (!this.#activeThreadId) return;
    const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
    this.#activeThreadId = "";
    await streamDeck.settings.setGlobalSettings({ ...settings, activeThreadId: "" });
    this.#emit();
  }

  state(threadId: string | undefined): StatusView {
    const completed = !!threadId && (this.#completedUntil.get(threadId) ?? 0) > Date.now();
    return statusFor(this.thread(threadId), this.#connection, completed, threadId ? this.#localActivity.get(threadId) : undefined);
  }

  reconnect(): Promise<void> {
    if (this.#reconnectPromise) return this.#reconnectPromise;
    this.#reconnectPromise = this.#performReconnect().finally(() => {
      this.#reconnectPromise = undefined;
    });
    return this.#reconnectPromise;
  }

  async #performReconnect(): Promise<void> {
    this.#pendingApprovals.clear();
    this.#connection = "starting";
    this.#lastError = "";
    this.#emit();
    try {
      await this.#client.start(this.#codexPath);
      this.#connection = "connected";
      await this.refresh();
    } catch (error) {
      this.#connection = "error";
      this.#lastError = error instanceof Error ? error.message : "Could not start Codex";
      this.#emit();
    }
    this.#schedulePoll();
  }

  async refresh(): Promise<void> {
    if (!this.#client.connected) return this.reconnect();
    this.#threads = await this.#client.listThreads();
    if (Date.now() - this.#lastUsageRefreshAt >= 60_000) await this.#refreshUsageSilently();
    await this.#refreshLocalActivity();
    this.#connection = "connected";
    this.#lastError = "";
    this.#emit();
  }

  async refreshUsage(): Promise<void> {
    if (!this.#client.connected) {
      await this.reconnect();
      if (!this.#client.connected) throw new Error(this.#lastError || "Codex is not connected");
    }
    const response = await this.#client.readRateLimits();
    this.#rateLimits = response.rateLimitsByLimitId?.codex ?? response.rateLimits;
    this.#usageError = "";
    this.#lastUsageRefreshAt = Date.now();
    this.#emit();
  }

  inspectorState(threadId?: string): JsonObject {
    return {
      type: "state",
      connection: this.#connection,
      lastError: this.#lastError,
      codexPath: this.#codexPath,
      activeThreadId: this.#activeThreadId,
      selectedThreadId: threadId ?? "",
      sessions: this.#threads.slice(0, 50).map((thread) => ({
        id: thread.id,
        name: thread.name || thread.preview || "Untitled session",
        cwd: thread.cwd || ""
      }))
    };
  }

  #normalizePath(value: unknown): string {
    return typeof value === "string" && value.trim() && !value.includes("\0") ? value.trim() : DEFAULT_CODEX_PATH;
  }

  #onNotification(method: string, params: Record<string, unknown>): void {
    const threadId = typeof params.threadId === "string" ? params.threadId : "";
    if (method === "turn/completed" && threadId) {
      this.#completedUntil.set(threadId, Date.now() + 15_000);
      setTimeout(() => this.#emit(), 15_100);
    }
    if (method === "thread/status/changed" && threadId && params.status && typeof params.status === "object") {
      const thread = this.thread(threadId);
      if (thread) thread.status = params.status as ThreadStatus;
    }
    if (method === "turn/started" && threadId) this.#completedUntil.delete(threadId);
    if (method === "serverRequest/resolved") this.#removePendingApproval(params.requestId);
    if (method === "account/rateLimits/updated") void this.#refreshUsageSilently();
    if (["turn/completed", "thread/closed"].includes(method) && threadId) this.#pendingApprovals.delete(threadId);
    this.#emit();
    if (["turn/completed", "thread/started", "thread/closed"].includes(method)) setTimeout(() => void this.refresh(), 250);
  }

  async #refreshUsageSilently(): Promise<void> {
    try {
      await this.refreshUsage();
    } catch (error) {
      this.#usageError = error instanceof Error ? error.message : "Usage unavailable";
      this.#emit();
    }
  }

  #onServerRequest(id: RpcId, method: string, params: Record<string, unknown>): void {
    const pending = parseApprovalRequest(id, method, params);
    if (!pending) {
      this.#client.respondError(id, -32601, `Codex Agent Keys does not handle ${method}`);
      return;
    }
    const queue = this.#pendingApprovals.get(pending.threadId) ?? [];
    if (!queue.some((item) => item.id === pending.id)) queue.push(pending);
    this.#pendingApprovals.set(pending.threadId, queue);
    this.#emit();
  }

  #removePendingApproval(requestId: unknown): void {
    if (typeof requestId !== "string" && typeof requestId !== "number") return;
    for (const [threadId, queue] of this.#pendingApprovals) {
      const remaining = queue.filter((pending) => pending.id !== requestId);
      if (remaining.length === 0) this.#pendingApprovals.delete(threadId);
      else if (remaining.length !== queue.length) this.#pendingApprovals.set(threadId, remaining);
    }
  }

  #schedulePoll(): void {
    if (this.#pollTimer) clearTimeout(this.#pollTimer);
    this.#pollTimer = setTimeout(() => void this.refresh().finally(() => this.#schedulePoll()), 5_000);
  }

  async #refreshLocalActivity(): Promise<void> {
    if (this.#readingActivity) return;
    this.#readingActivity = true;
    let changed = false;
    try {
      await Promise.all([...this.#watchedThreads].map(async (threadId) => {
        const sessionPath = this.thread(threadId)?.path;
        if (!sessionPath) return;
        const next = await readSessionActivity(sessionPath).catch(() => undefined);
        if (!next || this.#localActivity.get(threadId) === next) return;
        this.#localActivity.set(threadId, next);
        changed = true;
      }));
    } finally {
      this.#readingActivity = false;
    }
    if (changed) this.#emit();
  }

  #emit(): void {
    for (const listener of this.#listeners) listener();
  }
}

export const controller = new AgentKeysController();
