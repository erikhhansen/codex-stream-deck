import type { CodexDesktopThreadSettings } from "./desktop-ipc.js";

const DEFAULT_RETRY_DELAY_MS = 350;

export interface DesktopThreadSettingsWriter {
  updateThreadSettings(conversationId: string, threadSettings: CodexDesktopThreadSettings): Promise<void>;
}

export interface DesktopSettingsConvergenceOptions {
  retryDelayMs?: number;
  onRetryError?: (threadId: string, error: unknown) => void;
}

/**
 * Replays confirmed setting changes once a turn is idle so Codex Desktop's
 * renderer can converge with the settings already accepted by its backend.
 */
export class DesktopSettingsConvergence {
  readonly #writer: DesktopThreadSettingsWriter;
  readonly #retryDelayMs: number;
  readonly #onRetryError: ((threadId: string, error: unknown) => void) | undefined;
  readonly #pending = new Map<string, CodexDesktopThreadSettings>();
  readonly #timers = new Map<string, NodeJS.Timeout>();

  constructor(writer: DesktopThreadSettingsWriter, options: DesktopSettingsConvergenceOptions = {}) {
    this.#writer = writer;
    this.#retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.#onRetryError = options.onRetryError;
  }

  remember(threadId: string, patch: CodexDesktopThreadSettings): void {
    const next = { ...this.#pending.get(threadId) };
    if (Object.hasOwn(patch, "serviceTier")) next.serviceTier = patch.serviceTier ?? null;
    if (patch.model !== undefined) next.model = patch.model;
    if (Object.hasOwn(patch, "effort")) next.effort = patch.effort ?? null;
    this.#pending.set(threadId, next);
  }

  schedule(threadId: string): void {
    if (!this.#pending.has(threadId) || this.#timers.has(threadId)) return;
    const timer = setTimeout(() => {
      this.#timers.delete(threadId);
      void this.retry(threadId);
    }, this.#retryDelayMs);
    this.#timers.set(threadId, timer);
  }

  async retry(threadId: string): Promise<boolean> {
    const patch = this.#pending.get(threadId);
    if (!patch) return false;
    const attempted = { ...patch };
    try {
      await this.#writer.updateThreadSettings(threadId, attempted);
    } catch (error) {
      this.#onRetryError?.(threadId, error);
      return false;
    }
    this.#clearAttemptedSettings(threadId, attempted);
    return true;
  }

  clear(threadId: string): void {
    this.#pending.delete(threadId);
    const timer = this.#timers.get(threadId);
    if (timer) clearTimeout(timer);
    this.#timers.delete(threadId);
  }

  close(): void {
    for (const timer of this.#timers.values()) clearTimeout(timer);
    this.#timers.clear();
    this.#pending.clear();
  }

  #clearAttemptedSettings(threadId: string, attempted: CodexDesktopThreadSettings): void {
    const pending = this.#pending.get(threadId);
    if (!pending) return;
    const remaining = { ...pending };
    for (const key of ["serviceTier", "model", "effort"] as const) {
      if (Object.hasOwn(attempted, key) && Object.is(pending[key], attempted[key])) delete remaining[key];
    }
    if (Object.keys(remaining).length === 0) this.#pending.delete(threadId);
    else this.#pending.set(threadId, remaining);
  }
}
