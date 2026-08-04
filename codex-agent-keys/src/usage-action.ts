import streamDeck, {
  action,
  type KeyAction,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { controller } from "./controller.js";
import { hostImageDataUrl } from "./host-image.js";
import { rememberTouchbarWidth, touchbarWidth } from "./touchbar.js";
import { renderUsageKey } from "./usage.js";

@action({ UUID: "com.codexstreamdeck.agentkeys.usage" })
export class UsageAction extends SingletonAction<JsonObject> {
  readonly #rendered = new Map<string, string>();
  #scheduled = false;

  constructor() {
    super();
    controller.onChange(() => this.#scheduleRender());
  }

  override async onWillAppear(event: WillAppearEvent<JsonObject>): Promise<void> {
    if (!event.action.isKey()) return;
    this.#rendered.delete(event.action.id);
    rememberTouchbarWidth(event.action, event.payload.settings);
    await this.#render(event.action);
    void controller.refreshUsage().catch(() => undefined);
  }

  override onWillDisappear(event: WillDisappearEvent<JsonObject>): void {
    this.#rendered.delete(event.action.id);
  }

  override async onKeyDown(event: KeyDownEvent<JsonObject>): Promise<void> {
    try {
      await controller.refreshUsage();
      await event.action.showOk();
    } catch (error) {
      streamDeck.logger.warn(error instanceof Error ? error.message : "Could not refresh Codex usage");
      await event.action.showAlert();
    }
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
    const svg = renderUsageKey(controller.rateLimits, controller.usageError, touchbarWidth(key));
    if (this.#rendered.get(key.id) === svg) return;
    await key.setImage(await hostImageDataUrl(svg));
    this.#rendered.set(key.id, svg);
  }
}
