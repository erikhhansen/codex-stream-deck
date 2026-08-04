import streamDeck, {
  action,
  type KeyAction,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { hostImageDataUrl } from "./host-image.js";
import { rememberTouchbarWidth, touchbarWidth } from "./touchbar.js";
import { readTokensToday, renderTokensKey } from "./token-usage.js";

@action({ UUID: "com.codexstreamdeck.agentkeys.tokens-today" })
export class TokensTodayAction extends SingletonAction<JsonObject> {
  readonly #rendered = new Map<string, string>();
  #total: number | undefined;
  #refreshing: Promise<void> | undefined;

  constructor() {
    super();
    setInterval(() => {
      if ([...this.actions].length > 0) void this.#refresh();
    }, 60_000);
  }

  override async onWillAppear(event: WillAppearEvent<JsonObject>): Promise<void> {
    if (!event.action.isKey()) return;
    this.#rendered.delete(event.action.id);
    rememberTouchbarWidth(event.action, event.payload.settings);
    await this.#render(event.action);
    void this.#refresh();
  }

  override onWillDisappear(event: WillDisappearEvent<JsonObject>): void {
    this.#rendered.delete(event.action.id);
  }

  override async onKeyDown(event: KeyDownEvent<JsonObject>): Promise<void> {
    try {
      await this.#refresh();
      await event.action.showOk();
    } catch (error) {
      streamDeck.logger.warn(error instanceof Error ? error.message : "Could not read today's Codex tokens");
      await event.action.showAlert();
    }
  }

  #refresh(): Promise<void> {
    if (this.#refreshing) return this.#refreshing;
    this.#refreshing = readTokensToday().then(async (total) => {
      this.#total = total;
      await Promise.all([...this.actions].filter((item) => item.isKey()).map((item) => this.#render(item as KeyAction<JsonObject>)));
    }).finally(() => {
      this.#refreshing = undefined;
    });
    return this.#refreshing;
  }

  async #render(key: KeyAction<JsonObject>): Promise<void> {
    const svg = renderTokensKey(this.#total, touchbarWidth(key));
    if (this.#rendered.get(key.id) === svg) return;
    await key.setImage(await hostImageDataUrl(svg));
    this.#rendered.set(key.id, svg);
  }
}
