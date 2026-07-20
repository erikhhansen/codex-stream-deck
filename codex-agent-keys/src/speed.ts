import { SETTING_DISABLED_COLOR, SETTING_LEVEL_COLORS, SETTING_UNAVAILABLE_COLOR } from "./setting-colors.js";

export type SpeedState = "disabled" | "loading" | "standard" | "fast";

export function speedState(threadId: string, serviceTier: string | null | undefined): SpeedState {
  if (!threadId) return "disabled";
  if (serviceTier === undefined) return "loading";
  return serviceTier === "priority" ? "fast" : "standard";
}

export function renderSpeedKey(state: SpeedState): string {
  const fast = state === "fast";
  const disabled = state === "disabled";
  const fill = fast
    ? SETTING_LEVEL_COLORS[5]
    : state === "standard"
      ? SETTING_LEVEL_COLORS[0]
      : disabled
        ? SETTING_DISABLED_COLOR
        : SETTING_UNAVAILABLE_COLOR;
  const foreground = disabled ? "#7C8795" : "#17202B";
  const content = fast
    ? `<path d="M83 20 42 77h26l-8 47 43-62H76z" fill="none" stroke="${foreground}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`
    : state === "loading"
      ? `<circle cx="72" cy="72" r="25" fill="none" stroke="${foreground}" stroke-width="7" stroke-dasharray="20 12"/>`
      : `<text x="72" y="85" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="900" fill="${foreground}">${disabled ? "—" : "STD"}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" rx="20" fill="${fill}"/>
  <rect x="4" y="4" width="136" height="136" rx="17" fill="none" stroke="${foreground}" stroke-opacity=".25" stroke-width="2"/>
  ${content}
</svg>`;
}
