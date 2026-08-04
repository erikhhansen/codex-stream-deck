import streamDeck, {
  action,
  type DialDownEvent,
  type DialRotateEvent,
  type KeyAction,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { controller } from "./controller.js";
import { hostImageDataUrl } from "./host-image.js";
import { rememberTouchbarWidth, touchbarWidth } from "./touchbar.js";
import { renderSpeedKey, speedState } from "./speed.js";

@action({ UUID: "com.codexstreamdeck.agentkeys.speed" })
export class SpeedAction extends SingletonAction<JsonObject> {
  readonly #rendered = new Map<string, string>();
  #scheduled = false;
  #requestedThreadId = "";
  #changeQueue = Promise.resolve();

  constructor() {
    super();
    controller.onChange(() => this.#scheduleRender());
  }

  override async onWillAppear(event: WillAppearEvent<JsonObject>): Promise<void> {
    if (event.action.isKey()) {
      this.#rendered.delete(event.action.id);
      rememberTouchbarWidth(event.action, event.payload.settings);
      await this.#render(event.action);
    }
  }

  override onWillDisappear(event: WillDisappearEvent<JsonObject>): void {
    this.#rendered.delete(event.action.id);
  }

  override onDialRotate(event: DialRotateEvent<JsonObject>): Promise<void> {
    if (event.payload.ticks === 0) return Promise.resolve();
    return this.#queueChange(
      () => controller.setServiceTier(controller.activeThreadId, event.payload.ticks > 0 ? "priority" : null),
      event.action
    );
  }

  override onDialDown(event: DialDownEvent<JsonObject>): Promise<void> {
    return this.#queueChange(() => controller.toggleServiceTier(controller.activeThreadId), event.action);
  }

  #scheduleRender(): void {
    if (this.#scheduled) return;
    this.#scheduled = true;
    setTimeout(() => {
      this.#scheduled = false;
      void Promise.all([...this.actions].filter((item) => item.isKey()).map((item) => this.#render(item as KeyAction<JsonObject>)));
    }, 80);
  }

  async #render(key: KeyAction<JsonObject>): Promise<void> {
    const threadId = controller.activeThreadId;
    const tier = controller.serviceTier(threadId);
    const svg = renderSpeedKey(speedState(threadId, tier), touchbarWidth(key));
    if (this.#rendered.get(key.id) !== svg) {
      await key.setImage(await hostImageDataUrl(svg));
      this.#rendered.set(key.id, svg);
    }
    if (threadId && tier === undefined && this.#requestedThreadId !== threadId) {
      this.#requestedThreadId = threadId;
      void controller.refreshServiceTier(threadId).catch((error: unknown) => {
        streamDeck.logger.warn(error instanceof Error ? error.message : "Could not read Codex speed");
        this.#requestedThreadId = "";
      });
    }
  }

  #queueChange(
    update: () => Promise<void>,
    action: DialRotateEvent<JsonObject>["action"]
  ): Promise<void> {
    this.#changeQueue = this.#changeQueue.then(async () => {
      if (!controller.activeThreadId) throw new Error("Select a Codex session first");
      await update();
    }).catch(async (error: unknown) => {
      streamDeck.logger.warn(error instanceof Error ? error.message : "Could not change Codex speed");
      await action.showAlert();
    });
    return this.#changeQueue;
  }
}
