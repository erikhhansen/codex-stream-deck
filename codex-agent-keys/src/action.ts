import streamDeck, {
  action,
  type DidReceiveSettingsEvent,
  type KeyAction,
  type KeyDownEvent,
  type PropertyInspectorDidAppearEvent,
  type SendToPluginEvent,
  SingletonAction,
  type WillAppearEvent
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";

import { controller } from "./controller.js";
import { completionEmailNotifier } from "./completion-email.js";
import { openThread } from "./native.js";
import { renderKey, svgDataUrl, wrapTitle } from "./renderer.js";
import type { KeySettings } from "./types.js";

@action({ UUID: "com.codexstreamdeck.agentkeys.session" })
export class SessionKeyAction extends SingletonAction<KeySettings> {
  readonly #rendered = new Map<string, { svg: string; title: string }>();
  #scheduled = false;

  constructor() {
    super();
    controller.onChange(() => this.#scheduleRender());
    controller.onTurnCompleted((threadId) => void this.#queueCompletionEmail(threadId));
  }

  override async onWillAppear(event: WillAppearEvent<KeySettings>): Promise<void> {
    if (event.action.isKey()) await this.#render(event.action, event.payload.settings);
  }

  override async onDidReceiveSettings(event: DidReceiveSettingsEvent<KeySettings>): Promise<void> {
    if (event.action.isKey()) await this.#render(event.action, event.payload.settings);
  }

  override async onKeyDown(event: KeyDownEvent<KeySettings>): Promise<void> {
    try {
      const threadId = event.payload.settings.threadId?.trim();
      if (!threadId) throw new Error("Choose a Codex session first");
      await controller.selectThread(threadId);
      openThread(threadId);
      await event.action.showOk();
    } catch (error) {
      streamDeck.logger.warn(error instanceof Error ? error.message : "Could not open Codex session");
      await event.action.showAlert();
    }
  }

  override async onPropertyInspectorDidAppear(event: PropertyInspectorDidAppearEvent<KeySettings>): Promise<void> {
    const settings = await event.action.getSettings<KeySettings>();
    await streamDeck.ui.sendToPropertyInspector(controller.inspectorState(settings.threadId));
  }

  override async onSendToPlugin(event: SendToPluginEvent<JsonValue, KeySettings>): Promise<void> {
    const message = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
      ? event.payload as Record<string, JsonValue>
      : {};
    try {
      if (message.op === "refresh") await controller.refresh();
      if (message.op === "test") await controller.reconnect();
      if (message.op === "clearActive") await controller.clearActiveThread();
      if (message.op === "validateEmail") {
        const status = await completionEmailNotifier.validate();
        await streamDeck.ui.sendToPropertyInspector({
          type: "result",
          ok: true,
          message: `SendGrid sandbox validated (${status}); no email was sent.`
        });
        return;
      }
      const settings = await event.action.getSettings<KeySettings>();
      await streamDeck.ui.sendToPropertyInspector(controller.inspectorState(settings.threadId));
    } catch (error) {
      await streamDeck.ui.sendToPropertyInspector({
        type: "result",
        ok: false,
        message: error instanceof Error ? error.message : "Operation failed"
      });
    }
  }

  #scheduleRender(): void {
    if (this.#scheduled) return;
    this.#scheduled = true;
    setTimeout(() => {
      this.#scheduled = false;
      void this.#renderAll();
    }, 80);
  }

  async #renderAll(): Promise<void> {
    await Promise.all([...this.actions].filter((item) => item.isKey()).map(async (item) => {
      const key = item as KeyAction<KeySettings>;
      await this.#render(key, await key.getSettings<KeySettings>());
    }));
  }

  async #queueCompletionEmail(threadId: string): Promise<void> {
    const configuredName = controller.configuredAgentName(threadId);
    if (configuredName) {
      completionEmailNotifier.enqueue(threadId, configuredName, () => controller.completionEmailStats(threadId));
      return;
    }
    for (const item of this.actions) {
      if (!item.isKey()) continue;
      const key = item as KeyAction<KeySettings>;
      const settings = await key.getSettings<KeySettings>();
      if (settings.threadId?.trim() !== threadId) continue;
      const thread = controller.thread(threadId);
      const name = settings.displayName?.trim() || thread?.name || thread?.preview || "Codex agent";
      completionEmailNotifier.enqueue(threadId, name, () => controller.completionEmailStats(threadId));
      return;
    }
  }

  async #render(key: KeyAction<KeySettings>, settings: KeySettings): Promise<void> {
    controller.watchThread(settings.threadId);
    const thread = controller.thread(settings.threadId);
    const name = settings.displayName?.trim() || thread?.name || thread?.preview || "SESSION";
    const title = wrapTitle(name);
    const svg = renderKey(
      controller.state(settings.threadId),
      controller.flashOn,
      controller.isActiveThread(settings.threadId)
    );
    const previous = this.#rendered.get(key.id);
    if (previous?.svg !== svg) await key.setImage(svgDataUrl(svg));
    if (previous?.title !== title) await key.setTitle(title);
    this.#rendered.set(key.id, { svg, title });
  }
}
