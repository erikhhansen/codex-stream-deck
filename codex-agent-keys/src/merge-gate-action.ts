import streamDeck, {
  action,
  type KeyAction,
  type KeyDownEvent,
  type KeyUpEvent,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { controller } from "./controller.js";
import { MergeGateService, mergeGateOpenTarget, unavailableMergeGate, type MergeGateSnapshot } from "./merge-gate.js";
import { renderMergeGateKey } from "./merge-gate-renderer.js";
import { svgDataUrl } from "./renderer.js";
import { openProjectInVsCode } from "./vscode.js";

const REFRESH_MS = 30_000;
const HOLD_MS = 650;

@action({ UUID: "com.codexstreamdeck.agentkeys.merge-gate" })
export class MergeGateAction extends SingletonAction<JsonObject> {
  readonly #service = new MergeGateService();
  readonly #rendered = new Map<string, string>();
  readonly #pressedAt = new Map<string, number>();
  #snapshot: MergeGateSnapshot = unavailableMergeGate("", undefined, "NO TARGET", "Select an Agent Key first");
  #selectedThreadId = "";
  #generation = 0;
  #refreshTimer: NodeJS.Timeout | undefined;
  #refreshing: Promise<void> | undefined;
  #refreshAgain = false;

  constructor() {
    super();
    controller.onChange(() => {
      const selected = controller.activeThreadId;
      if (selected === this.#selectedThreadId) return;
      this.#selectedThreadId = selected;
      if ([...this.actions].some((item) => item.isKey())) void this.#requestRefresh();
    });
  }

  override async onWillAppear(event: WillAppearEvent<JsonObject>): Promise<void> {
    if (!event.action.isKey()) return;
    await event.action.setTitle("");
    await this.#render(event.action);
    this.#startTimer();
    await this.#requestRefresh(true);
  }

  override onWillDisappear(_event: WillDisappearEvent<JsonObject>): void {
    setTimeout(() => {
      if ([...this.actions].length === 0 && this.#refreshTimer) {
        clearInterval(this.#refreshTimer);
        this.#refreshTimer = undefined;
        this.#generation += 1;
      }
    }, 0);
  }

  override onKeyDown(event: KeyDownEvent<JsonObject>): void {
    this.#pressedAt.set(event.action.id, Date.now());
  }

  override async onKeyUp(event: KeyUpEvent<JsonObject>): Promise<void> {
    const started = this.#pressedAt.get(event.action.id) ?? Date.now();
    this.#pressedAt.delete(event.action.id);
    const held = Date.now() - started >= HOLD_MS;
    await this.#requestRefresh(true);
    const target = mergeGateOpenTarget(this.#snapshot, held);
    if (!target) {
      streamDeck.logger.info(`Merge Gate: ${this.#snapshot.state} — ${this.#snapshot.detail}`);
      await event.action.showAlert();
      return;
    }
    try {
      if (target.kind === "url") await streamDeck.system.openUrl(target.value);
      else await openProjectInVsCode(target.value);
      await event.action.showOk();
    } catch (error) {
      streamDeck.logger.warn(error instanceof Error ? error.message : "Could not open Merge Gate evidence");
      await event.action.showAlert();
    }
  }

  #startTimer(): void {
    if (this.#refreshTimer) return;
    this.#refreshTimer = setInterval(() => void this.#requestRefresh(), REFRESH_MS);
  }

  #requestRefresh(force = false): Promise<void> {
    if (!force && ![...this.actions].some((item) => item.isKey())) return Promise.resolve();
    if (this.#refreshing) {
      this.#refreshAgain = true;
      return this.#refreshing;
    }
    this.#refreshing = (async () => {
      do {
        this.#refreshAgain = false;
        await this.#performRefresh();
      } while (this.#refreshAgain && [...this.actions].some((item) => item.isKey()));
    })().finally(() => {
      this.#refreshing = undefined;
    });
    return this.#refreshing;
  }

  async #performRefresh(): Promise<void> {
    const generation = ++this.#generation;
    const threadId = controller.activeThreadId;
    this.#selectedThreadId = threadId;
    const cwd = controller.thread(threadId)?.cwd;
    const snapshot = await this.#service.inspect(threadId, cwd);
    if (generation !== this.#generation || threadId !== controller.activeThreadId) return;
    this.#snapshot = snapshot;
    streamDeck.logger.debug(`Merge Gate: ${snapshot.state} — ${snapshot.detail}`);
    await Promise.all([...this.actions].filter((item) => item.isKey()).map((item) => this.#render(item as KeyAction<JsonObject>)));
  }

  async #render(key: KeyAction<JsonObject>): Promise<void> {
    const svg = renderMergeGateKey(this.#snapshot);
    if (this.#rendered.get(key.id) === svg) return;
    await key.setImage(svgDataUrl(svg));
    this.#rendered.set(key.id, svg);
  }
}
