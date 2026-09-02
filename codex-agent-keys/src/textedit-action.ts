import streamDeck, { action, type KeyDownEvent, SingletonAction } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { openTextEditPlainText } from "./textedit.js";

@action({ UUID: "com.codexstreamdeck.agentkeys.textedit" })
export class TextEditAction extends SingletonAction<JsonObject> {
  override async onKeyDown(event: KeyDownEvent<JsonObject>): Promise<void> {
    try {
      await openTextEditPlainText();
      await event.action.showOk();
    } catch (error) {
      streamDeck.logger.warn(error instanceof Error ? error.message : "Could not open TextEdit");
      await event.action.showAlert();
    }
  }
}
