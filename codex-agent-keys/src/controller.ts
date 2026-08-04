import streamDeck from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { approvalResponse, parseApprovalRequest, type ApprovalChoice, type PendingApproval, type RpcId } from "./approval.js";
import { CodexClient } from "./codex-client.js";
import { readConfiguredAgents } from "./configured-agents.js";
import { CodexDesktopIpcClient, type CodexDesktopThreadSettings } from "./desktop-ipc.js";
import { DesktopSettingsConvergence } from "./desktop-settings-convergence.js";
import { didFinishWork, readSessionActivity } from "./session-activity.js";
import { getGlobalSettings, rememberGlobalSettings, setGlobalSettings } from "./global-settings.js";
import { normalizeThreadId, requireThreadId } from "./selection.js";
import { statusFor } from "./status.js";
import type { CodexModelOption, CodexThread, CompletionEmailStats, ConnectionState, GlobalSettings, LocalActivity, RateLimitSnapshot, StatusView, ThreadRuntimeSettings, ThreadStatus } from "./types.js";
import { usageView } from "./usage.js";

const DEFAULT_CODEX_PATH = process.platform === "darwin" ? "/Applications/Codex.app/Contents/Resources/codex" : "codex";
const RUNTIME_SETTING_KEYS = ["serviceTier", "model", "reasoningEffort"] as const;

export interface DesktopSettingsClient {
  updateThreadSettings(conversationId: string, threadSettings: CodexDesktopThreadSettings): Promise<void>;
  close(): void;
}

export class AgentKeysController {
  readonly #client: CodexClient;
  readonly #desktopSettingsClient: DesktopSettingsClient;
  readonly #desktopSettingsConvergence: DesktopSettingsConvergence;
  readonly #listeners = new Set<() => void>();
  readonly #completionListeners = new Set<(threadId: string) => void>();
  readonly #completedUntil = new Map<string, number>();
  readonly #watchedThreads = new Set<string>();
  readonly #localActivity = new Map<string, LocalActivity>();
  readonly #pendingApprovals = new Map<string, PendingApproval[]>();
  readonly #serviceTiers = new Map<string, string | null>();
  readonly #models = new Map<string, string>();
  readonly #efforts = new Map<string, string | null>();
  readonly #desktopSettingsOverrides = new Map<string, Partial<ThreadRuntimeSettings>>();
  readonly #runtimeSettingsRefreshes = new Map<string, Promise<ThreadRuntimeSettings>>();
  #modelCatalog: CodexModelOption[] | undefined;
  readonly #modelAliases = new Map<string, string>();
  readonly #configuredAgentNames = new Map<string, string>();
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
  #stopping = false;

  constructor(client = new CodexClient(), desktopSettingsClient: DesktopSettingsClient = new CodexDesktopIpcClient()) {
    this.#client = client;
    this.#desktopSettingsClient = desktopSettingsClient;
    this.#desktopSettingsConvergence = new DesktopSettingsConvergence(desktopSettingsClient, {
      onRetryError: (threadId, error) => {
        const message = error instanceof Error ? error.message : "unknown error";
        streamDeck.logger.warn(`Could not refresh Codex desktop settings after turn completion: thread=${threadId} error=${message}`);
      }
    });
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
    this.#stopping = false;
    const settings = await getGlobalSettings();
    this.#codexPath = this.#normalizePath(settings.codexPath);
    this.#activeThreadId = normalizeThreadId(settings.activeThreadId);
    for (const agent of await readConfiguredAgents().catch(() => [])) {
      this.#configuredAgentNames.set(agent.threadId, agent.name);
      this.#watchedThreads.add(agent.threadId);
    }
    streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((event) => {
      const settings = rememberGlobalSettings(event.settings);
      const next = this.#normalizePath(settings.codexPath);
      const nextActiveThreadId = normalizeThreadId(settings.activeThreadId);
      const selectionChanged = nextActiveThreadId !== this.#activeThreadId;
      this.#activeThreadId = nextActiveThreadId;
      if (next !== this.#codexPath) {
        this.#codexPath = next;
        void this.reconnect();
      }
      if (selectionChanged) {
        this.#emit();
        if (nextActiveThreadId && !this.thread(nextActiveThreadId)?.archived) {
          void this.#refreshRuntimeSettingsSilently(nextActiveThreadId);
        }
      }
    });
    this.#flashTimer = setInterval(() => {
      this.#flashOn = !this.#flashOn;
      this.#emit();
    }, 650);
    this.#activityTimer = setInterval(() => void this.#refreshLocalActivity(), 1_000);
    await this.reconnect();
  }

  async stop(): Promise<void> {
    this.#stopping = true;
    if (this.#pollTimer) clearTimeout(this.#pollTimer);
    if (this.#flashTimer) clearInterval(this.#flashTimer);
    if (this.#activityTimer) clearInterval(this.#activityTimer);
    this.#pollTimer = undefined;
    this.#flashTimer = undefined;
    this.#activityTimer = undefined;
    this.#desktopSettingsConvergence.close();
    this.#desktopSettingsClient.close();
    await this.#client.stop();
  }

  onChange(listener: () => void): void {
    this.#listeners.add(listener);
  }

  onTurnCompleted(listener: (threadId: string) => void): void {
    this.#completionListeners.add(listener);
  }

  thread(threadId: string | undefined): CodexThread | undefined {
    return threadId ? this.#threads.find((thread) => thread.id === threadId) : undefined;
  }

  watchThread(threadId: string | undefined): void {
    if (!threadId) return;
    this.#watchedThreads.add(threadId);
    void this.#refreshLocalActivity();
  }

  configuredAgentName(threadId: string): string | undefined {
    return this.#configuredAgentNames.get(threadId);
  }

  async completionEmailStats(threadId: string): Promise<CompletionEmailStats> {
    try {
      await this.refreshServiceTier(threadId);
    } catch {
      // A completion email is still useful when runtime settings cannot be refreshed.
    }
    const thread = this.thread(threadId);
    const project = thread?.cwd?.split(/[\\/]/).filter(Boolean).at(-1);
    const effort = this.#efforts.get(threadId);
    const serviceTier = this.#serviceTiers.get(threadId);
    const remaining = usageView(this.#rateLimits).remaining;
    return {
      project,
      model: this.#models.get(threadId),
      effort: effort ? effort.toUpperCase() : effort === null ? "AUTO" : undefined,
      speed: serviceTier === undefined ? undefined : serviceTier === "priority" ? "Fast" : "Standard",
      usageRemaining: remaining ?? undefined,
      completedAt: new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(new Date())
    };
  }

  isActiveThread(threadId: string | undefined): boolean {
    return !!threadId && threadId === this.#activeThreadId;
  }

  isWaitingForApproval(threadId: string): boolean {
    return (this.#pendingApprovals.get(threadId)?.length ?? 0) > 0;
  }

  serviceTier(threadId: string | undefined): string | null | undefined {
    return threadId ? this.#serviceTiers.get(threadId) : undefined;
  }

  async refreshServiceTier(threadId: string): Promise<string | null> {
    return (await this.refreshRuntimeSettings(threadId)).serviceTier;
  }

  async setServiceTier(threadId: string, serviceTier: string | null): Promise<void> {
    const selected = requireThreadId(threadId);
    if (this.thread(selected)?.archived) throw new Error("The selected Codex session is archived");
    await this.#desktopSettingsClient.updateThreadSettings(selected, { serviceTier });
    this.#rememberDesktopSettings(selected, { serviceTier });
    streamDeck.logger.info(`Codex desktop speed updated: thread=${selected} tier=${serviceTier ?? "standard"}`);
    if (this.#serviceTiers.get(selected) !== serviceTier) {
      this.#serviceTiers.set(selected, serviceTier);
      this.#emit();
    }
  }

  async toggleServiceTier(threadId: string): Promise<void> {
    const selected = requireThreadId(threadId);
    const current = this.#serviceTiers.has(selected)
      ? this.#serviceTiers.get(selected)
      : await this.refreshServiceTier(selected);
    await this.setServiceTier(selected, current === "priority" ? null : "priority");
  }

  model(threadId: string | undefined): string | undefined {
    return threadId ? this.#models.get(threadId) : undefined;
  }

  async refreshModel(threadId: string): Promise<string> {
    return (await this.refreshRuntimeSettings(threadId)).model;
  }

  async cycleModel(threadId: string, steps: number): Promise<void> {
    const selected = requireThreadId(threadId);
    if (this.thread(selected)?.archived) throw new Error("The selected Codex session is archived");
    const settings = this.#models.has(selected) && this.#efforts.has(selected)
      ? { model: this.#models.get(selected)!, reasoningEffort: this.#efforts.get(selected)! }
      : await this.refreshRuntimeSettings(selected);
    const catalog = await this.#modelsCatalog();
    if (catalog.length === 0) throw new Error("Codex did not report any available models");
    const currentModel = this.#canonicalModelId(settings.model);
    const currentIndex = catalog.findIndex((item) => item.model === currentModel);
    const start = currentIndex >= 0 ? currentIndex : steps >= 0 ? -1 : 0;
    const next = catalog[this.#wrapIndex(start + steps, catalog.length)]!;
    const nextEffort = settings.reasoningEffort === null || next.supportedReasoningEfforts.includes(settings.reasoningEffort)
      ? settings.reasoningEffort
      : next.supportedReasoningEfforts.at(-1) ?? null;
    await this.#desktopSettingsClient.updateThreadSettings(selected, { model: next.model, effort: nextEffort });
    this.#rememberDesktopSettings(selected, { model: next.model, effort: nextEffort });
    streamDeck.logger.info(`Codex desktop model updated: thread=${selected} model=${next.model} effort=${nextEffort ?? "auto"}`);
    if (this.#models.get(selected) !== next.model || this.#efforts.get(selected) !== nextEffort) {
      this.#models.set(selected, next.model);
      this.#efforts.set(selected, nextEffort);
      this.#emit();
    }
  }

  effort(threadId: string | undefined): string | null | undefined {
    return threadId ? this.#efforts.get(threadId) : undefined;
  }

  async refreshEffort(threadId: string): Promise<string | null> {
    return (await this.refreshRuntimeSettings(threadId)).reasoningEffort;
  }

  async cycleEffort(threadId: string, steps: number): Promise<void> {
    const selected = requireThreadId(threadId);
    if (this.thread(selected)?.archived) throw new Error("The selected Codex session is archived");
    const settings = this.#models.has(selected) && this.#efforts.has(selected)
      ? { model: this.#models.get(selected)!, reasoningEffort: this.#efforts.get(selected)! }
      : await this.refreshRuntimeSettings(selected);
    const catalog = await this.#modelsCatalog();
    const model = catalog.find((item) => item.model === this.#canonicalModelId(settings.model));
    const choices = model?.supportedReasoningEfforts ?? [];
    if (choices.length === 0) throw new Error(`Codex did not report effort choices for ${settings.model}`);
    const currentIndex = settings.reasoningEffort === null ? -1 : choices.indexOf(settings.reasoningEffort);
    const start = currentIndex >= 0 ? currentIndex : steps >= 0 ? -1 : 0;
    const next = choices[this.#wrapIndex(start + steps, choices.length)]!;
    await this.#desktopSettingsClient.updateThreadSettings(selected, { effort: next });
    this.#rememberDesktopSettings(selected, { effort: next });
    streamDeck.logger.info(`Codex desktop effort updated: thread=${selected} effort=${next}`);
    if (this.#efforts.get(selected) !== next) {
      this.#efforts.set(selected, next);
      this.#emit();
    }
  }

  async refreshRuntimeSettings(threadId: string): Promise<ThreadRuntimeSettings> {
    const selected = requireThreadId(threadId);
    if (this.thread(selected)?.archived) throw new Error("The selected Codex session is archived");
    if (!this.#client.connected) await this.reconnect();
    if (!this.#client.connected) throw new Error(this.#lastError || "Codex is not connected");
    const current = this.#runtimeSettingsRefreshes.get(selected);
    if (current) return current;
    const refresh = this.#client.readThreadRuntimeSettings(selected).then((reportedSettings) => {
      const settings = this.#mergeReportedSettings(selected, reportedSettings) as ThreadRuntimeSettings;
      const changed = this.#serviceTiers.get(selected) !== settings.serviceTier
        || this.#models.get(selected) !== settings.model
        || this.#efforts.get(selected) !== settings.reasoningEffort;
      this.#serviceTiers.set(selected, settings.serviceTier);
      this.#models.set(selected, settings.model);
      this.#efforts.set(selected, settings.reasoningEffort);
      if (changed) this.#emit();
      return settings;
    }).finally(() => this.#runtimeSettingsRefreshes.delete(selected));
    this.#runtimeSettingsRefreshes.set(selected, refresh);
    return refresh;
  }

  async recoverApproval(threadId: string): Promise<boolean> {
    const selected = requireThreadId(threadId);
    if (this.isWaitingForApproval(selected)) return true;
    const waiting = this.thread(selected)?.status?.activeFlags?.includes("waitingOnApproval") ?? false;
    if (!waiting) return false;
    await this.refreshRuntimeSettings(selected);
    if (this.isWaitingForApproval(selected)) return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
    return this.isWaitingForApproval(selected);
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
    const settings = await getGlobalSettings();
    this.#activeThreadId = selected;
    await setGlobalSettings({ ...settings, activeThreadId: selected });
    this.#emit();
    if (!this.thread(selected)?.archived) void this.#refreshRuntimeSettingsSilently(selected);
  }

  async clearActiveThread(): Promise<void> {
    if (!this.#activeThreadId) return;
    const settings = await getGlobalSettings();
    this.#activeThreadId = "";
    await setGlobalSettings({ ...settings, activeThreadId: "" });
    this.#emit();
  }

  state(threadId: string | undefined): StatusView {
    const completed = !!threadId && (this.#completedUntil.get(threadId) ?? 0) > Date.now();
    return statusFor(
      this.thread(threadId),
      this.#connection,
      completed,
      threadId ? this.#localActivity.get(threadId) : undefined,
      !!threadId && this.isWaitingForApproval(threadId)
    );
  }

  reconnect(): Promise<void> {
    if (this.#stopping) return Promise.resolve();
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
    const [activeThreads, archivedThreads] = await Promise.all([
      this.#client.listThreads(false),
      this.#client.listThreads(true)
    ]);
    const retainedThreadIds = new Set(this.#watchedThreads);
    if (this.#activeThreadId) retainedThreadIds.add(this.#activeThreadId);
    const retainedArchivedThreads = archivedThreads.filter((thread) => retainedThreadIds.has(thread.id));
    this.#threads = [...activeThreads, ...retainedArchivedThreads];
    for (const thread of retainedArchivedThreads) {
      this.#serviceTiers.delete(thread.id);
      this.#models.delete(thread.id);
      this.#efforts.delete(thread.id);
      this.#desktopSettingsOverrides.delete(thread.id);
      this.#desktopSettingsConvergence.clear(thread.id);
      this.#pendingApprovals.delete(thread.id);
    }
    if (this.#activeThreadId && !this.thread(this.#activeThreadId)?.archived) {
      void this.#refreshRuntimeSettingsSilently(this.#activeThreadId);
    }
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
    const selectedSession = this.thread(threadId);
    return {
      type: "state",
      connection: this.#connection,
      lastError: this.#lastError,
      codexPath: this.#codexPath,
      activeThreadId: this.#activeThreadId,
      selectedThreadId: threadId ?? "",
      selectedSession: selectedSession ? {
        id: selectedSession.id,
        name: selectedSession.name || selectedSession.preview || "Untitled session",
        cwd: selectedSession.cwd || "",
        archived: selectedSession.archived === true
      } : undefined,
      sessions: this.#threads.filter((thread) => !thread.archived).slice(0, 50).map((thread) => ({
        id: thread.id,
        name: thread.name || thread.preview || "Untitled session",
        cwd: thread.cwd || ""
      }))
    };
  }

  #normalizePath(value: unknown): string {
    return typeof value === "string" && value.trim() && !value.includes("\0") ? value.trim() : DEFAULT_CODEX_PATH;
  }

  async #modelsCatalog(): Promise<CodexModelOption[]> {
    if (this.#modelCatalog) return this.#modelCatalog;
    if (!this.#client.connected) await this.reconnect();
    if (!this.#client.connected) throw new Error(this.#lastError || "Codex is not connected");
    const options = await this.#client.listModels();
    const unique = new Map<string, CodexModelOption>();
    for (const option of options) {
      const key = option.displayName.trim().toLowerCase();
      const existing = unique.get(key);
      if (!existing || this.#isCanonicalModelId(option) && !this.#isCanonicalModelId(existing)) {
        unique.set(key, option);
      }
    }
    this.#modelAliases.clear();
    for (const option of options) {
      const canonical = unique.get(option.displayName.trim().toLowerCase());
      if (canonical) this.#modelAliases.set(option.model, canonical.model);
    }
    return (this.#modelCatalog = [...unique.values()]);
  }

  #canonicalModelId(model: string): string {
    return this.#modelAliases.get(model) ?? model;
  }

  #isCanonicalModelId(option: CodexModelOption): boolean {
    return option.model.toLowerCase() === option.displayName.trim().toLowerCase();
  }

  #wrapIndex(index: number, length: number): number {
    return ((index % length) + length) % length;
  }

  #onNotification(method: string, params: Record<string, unknown>): void {
    const threadId = typeof params.threadId === "string" ? params.threadId : "";
    if (method === "turn/completed" && threadId) {
      this.#completedUntil.set(threadId, Date.now() + 15_000);
      this.#desktopSettingsConvergence.schedule(threadId);
      for (const listener of this.#completionListeners) listener(threadId);
      setTimeout(() => this.#emit(), 15_100);
    }
    if (method === "thread/status/changed" && threadId && params.status && typeof params.status === "object") {
      const thread = this.thread(threadId);
      if (thread) thread.status = params.status as ThreadStatus;
    }
    if (method === "turn/started" && threadId) this.#completedUntil.delete(threadId);
    if (method === "serverRequest/resolved") this.#removePendingApproval(params.requestId);
    if (method === "thread/settings/updated" && threadId) {
      const settings = params.threadSettings;
      if (settings && typeof settings === "object" && !Array.isArray(settings)) {
        const reported: Partial<ThreadRuntimeSettings> = {};
        const tier = (settings as Record<string, unknown>).serviceTier;
        if (typeof tier === "string" || tier === null) reported.serviceTier = tier;
        const model = (settings as Record<string, unknown>).model;
        if (typeof model === "string" && model) reported.model = model;
        const effort = (settings as Record<string, unknown>).effort;
        if (typeof effort === "string" || effort === null) reported.reasoningEffort = effort;
        const accepted = this.#mergeReportedSettings(threadId, reported);
        if (Object.hasOwn(accepted, "serviceTier")) this.#serviceTiers.set(threadId, accepted.serviceTier!);
        if (accepted.model !== undefined) this.#models.set(threadId, accepted.model);
        if (Object.hasOwn(accepted, "reasoningEffort")) this.#efforts.set(threadId, accepted.reasoningEffort!);
      }
    }
    if (method === "account/rateLimits/updated") void this.#refreshUsageSilently();
    if (["turn/completed", "thread/closed"].includes(method) && threadId) this.#pendingApprovals.delete(threadId);
    this.#emit();
    if (["turn/completed", "thread/started", "thread/closed", "thread/archived", "thread/unarchived"].includes(method)) {
      setTimeout(() => void this.refresh(), 250);
    }
  }

  async #refreshUsageSilently(): Promise<void> {
    try {
      await this.refreshUsage();
    } catch (error) {
      this.#usageError = error instanceof Error ? error.message : "Usage unavailable";
      this.#emit();
    }
  }

  async #refreshRuntimeSettingsSilently(threadId: string): Promise<void> {
    try {
      await this.refreshRuntimeSettings(threadId);
    } catch (error) {
      streamDeck.logger.warn(error instanceof Error ? error.message : "Could not refresh Codex runtime settings");
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
    if (this.#stopping) return;
    if (this.#pollTimer) clearTimeout(this.#pollTimer);
    this.#pollTimer = setTimeout(() => {
      void this.refresh()
        .catch((error: unknown) => {
          this.#connection = "error";
          this.#lastError = error instanceof Error ? error.message : "Could not refresh Codex sessions";
          this.#emit();
        })
        .finally(() => this.#schedulePoll());
    }, 5_000);
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
        const previous = this.#localActivity.get(threadId);
        if (!next || previous === next) return;
        this.#localActivity.set(threadId, next);
        if (didFinishWork(previous, next)) {
          for (const listener of this.#completionListeners) listener(threadId);
        }
        changed = true;
      }));
    } finally {
      this.#readingActivity = false;
    }
    if (changed) this.#emit();
  }

  #rememberDesktopSettings(threadId: string, patch: CodexDesktopThreadSettings): void {
    this.#desktopSettingsConvergence.remember(threadId, patch);
    const next = { ...this.#desktopSettingsOverrides.get(threadId) };
    if (Object.hasOwn(patch, "serviceTier")) next.serviceTier = patch.serviceTier ?? null;
    if (patch.model !== undefined) next.model = patch.model;
    if (Object.hasOwn(patch, "effort")) next.reasoningEffort = patch.effort ?? null;
    this.#desktopSettingsOverrides.set(threadId, next);
  }

  #mergeReportedSettings(
    threadId: string,
    reported: Partial<ThreadRuntimeSettings>
  ): Partial<ThreadRuntimeSettings> {
    const overrides = { ...this.#desktopSettingsOverrides.get(threadId) };
    const accepted: Partial<ThreadRuntimeSettings> = {};
    for (const key of RUNTIME_SETTING_KEYS) {
      if (!Object.hasOwn(reported, key)) continue;
      const reportedValue = reported[key];
      if (!Object.hasOwn(overrides, key)) {
        Object.assign(accepted, { [key]: reportedValue });
        continue;
      }
      const overrideValue = overrides[key];
      if (Object.is(reportedValue, overrideValue)) {
        delete overrides[key];
        Object.assign(accepted, { [key]: reportedValue });
      } else {
        Object.assign(accepted, { [key]: overrideValue });
      }
    }
    if (Object.keys(overrides).length === 0) this.#desktopSettingsOverrides.delete(threadId);
    else this.#desktopSettingsOverrides.set(threadId, overrides);
    return accepted;
  }

  #emit(): void {
    for (const listener of this.#listeners) listener();
  }
}

export const controller = new AgentKeysController();
