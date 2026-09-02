import type { KeyAction } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { isStreamDock } from "./host.js";

interface TouchbarSettings extends JsonObject {
  touchbarWidth?: number;
}

const widths = new Map<string, number>();

export function rememberTouchbarWidth(key: KeyAction<JsonObject>, settings: JsonObject): void {
  if (!isStreamDock()) return;
  const width = (settings as TouchbarSettings).touchbarWidth;
  if (typeof width === "number" && Number.isFinite(width) && width > 0) {
    widths.set(key.id, Math.max(64, Math.min(240, Math.round(width))));
  }
}

export function touchbarWidth(key: KeyAction<JsonObject>): number | undefined {
  if (!isStreamDock()) return undefined;
  return widths.get(key.id);
}
