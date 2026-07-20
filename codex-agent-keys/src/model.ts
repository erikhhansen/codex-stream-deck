import { SETTING_DISABLED_COLOR, SETTING_LEVEL_COLORS, SETTING_UNAVAILABLE_COLOR } from "./setting-colors.js";

export type ModelState = "disabled" | "loading" | "sol" | "terra" | "other";

export function modelState(threadId: string, model: string | undefined): ModelState {
  if (!threadId) return "disabled";
  if (!model) return "loading";
  if (/(?:^|-)sol$/i.test(model)) return "sol";
  if (/(?:^|-)terra$/i.test(model)) return "terra";
  return "other";
}

export function renderModelKey(state: ModelState): string {
  const disabled = state === "disabled";
  const fill = state === "sol"
    ? SETTING_LEVEL_COLORS[5]
    : state === "terra"
      ? SETTING_LEVEL_COLORS[0]
      : disabled
        ? SETTING_DISABLED_COLOR
        : SETTING_UNAVAILABLE_COLOR;
  const foreground = disabled ? "#7C8795" : "#17202B";
  const label = state === "sol" ? "SOL" : state === "terra" ? "TERRA" : state === "other" ? "MODEL" : disabled ? "—" : "…";
  const fontSize = label.length > 3 ? 29 : 43;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" rx="20" fill="${fill}"/>
  <rect x="4" y="4" width="136" height="136" rx="17" fill="none" stroke="${foreground}" stroke-opacity=".25" stroke-width="2"/>
  <text x="72" y="85" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="900" fill="${foreground}">${label}</text>
</svg>`;
}
