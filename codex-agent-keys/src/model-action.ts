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
import { modelState, renderModelKey } from "./model.js";
import { hostImageDataUrl } from "./host-image.js";
import { rememberTouchbarWidth, touchbarWidth } from "./touchbar.js";

@action({ UUID: "com.codexstreamdeck.agentkeys.model" })
export class ModelAction extends SingletonAction<JsonObject> {
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
    return this.#queueChange(event.payload.ticks, event.action);
  }

  override onDialDown(event: DialDownEvent<JsonObject>): Promise<void> {
    return this.#queueChange(1, event.action);
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
    const model = controller.model(threadId);
    const svg = renderModelKey(modelState(threadId, model), touchbarWidth(key), model);
    if (this.#rendered.get(key.id) !== svg) {
      await key.setImage(await hostImageDataUrl(svg));
      this.#rendered.set(key.id, svg);
    }
    if (threadId && model === undefined && this.#requestedThreadId !== threadId) {
      this.#requestedThreadId = threadId;
      void controller.refreshModel(threadId).catch((error: unknown) => {
        streamDeck.logger.warn(error instanceof Error ? error.message : "Could not read Codex model");
        this.#requestedThreadId = "";
      });
    }
  }

  #queueChange(steps: number, action: DialRotateEvent<JsonObject>["action"]): Promise<void> {
    this.#changeQueue = this.#changeQueue.then(async () => {
      const threadId = controller.activeThreadId;
      if (!threadId) throw new Error("Select a Codex session first");
      await controller.cycleModel(threadId, steps);
    }).catch(async (error: unknown) => {
      streamDeck.logger.warn(error instanceof Error ? error.message : "Could not change Codex model");
      await action.showAlert();
    });
    return this.#changeQueue;
  }
}
