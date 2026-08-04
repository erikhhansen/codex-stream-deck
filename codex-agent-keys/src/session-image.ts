import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { isStreamDock } from "./host-image.js";
import { svgDataUrl } from "./renderer.js";
import type { StatusView } from "./types.js";

const pngCache = new Map<string, string>();

export function sessionImageStem(state: StatusView, flashOn: boolean, selected: boolean): string {
  const label = state.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const flash = state.flashing && !flashOn ? "-flash" : "";
  return `${label}${flash}${selected ? "-selected" : ""}`;
}

export function sessionImageDataUrl(
  svg: string,
  state: StatusView,
  flashOn: boolean,
  selected: boolean
): string {
  if (!isStreamDock()) return svgDataUrl(svg);

  const stem = sessionImageStem(state, flashOn, selected);
  const cached = pngCache.get(stem);
  if (cached) return cached;

  const path = fileURLToPath(new URL(`../imgs/session-states/${stem}.png`, import.meta.url));
  const dataUrl = `data:image/png;base64,${readFileSync(path).toString("base64")}`;
  pngCache.set(stem, dataUrl);
  return dataUrl;
}
