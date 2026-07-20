import streamDeck, {
  action,
  type KeyAction,
  SingletonAction,
  type WillAppearEvent
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { controller } from "./controller.js";
import { svgDataUrl } from "./renderer.js";
import { renderSpeedKey, speedState } from "./speed.js";

@action({ UUID: "com.codexstreamdeck.agentkeys.speed" })
export class SpeedAction extends SingletonAction<JsonObject> {
  readonly #rendered = new Map<string, string>();
  #scheduled = false;
  #requestedThreadId = "";

  constructor() {
    super();
    controller.onChange(() => this.#scheduleRender());
  }

  override async onWillAppear(event: WillAppearEvent<JsonObject>): Promise<void> {
    if (event.action.isKey()) await this.#render(event.action);
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
    const svg = renderSpeedKey(speedState(threadId, tier));
    if (this.#rendered.get(key.id) !== svg) {
      await key.setImage(svgDataUrl(svg));
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
}
