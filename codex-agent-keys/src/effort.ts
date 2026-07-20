import { SETTING_DISABLED_COLOR, SETTING_LEVEL_COLORS, SETTING_UNAVAILABLE_COLOR } from "./setting-colors.js";

export type EffortState = "disabled" | "loading" | "auto" | "low" | "medium" | "high" | "xhigh" | "max" | "ultra" | "other";

export function effortState(threadId: string, effort: string | null | undefined): EffortState {
  if (!threadId) return "disabled";
  if (effort === undefined) return "loading";
  if (effort === null) return "auto";
  const normalized = effort.toLowerCase();
  if (["low", "medium", "high", "xhigh", "max", "ultra"].includes(normalized)) return normalized as EffortState;
  return "other";
}

export function renderEffortKey(state: EffortState): string {
  const colors: Record<EffortState, string> = {
    disabled: SETTING_DISABLED_COLOR,
    loading: SETTING_UNAVAILABLE_COLOR,
    auto: SETTING_UNAVAILABLE_COLOR,
    low: SETTING_LEVEL_COLORS[0],
    medium: SETTING_LEVEL_COLORS[1],
    high: SETTING_LEVEL_COLORS[2],
    xhigh: SETTING_LEVEL_COLORS[3],
    max: SETTING_LEVEL_COLORS[4],
    ultra: SETTING_LEVEL_COLORS[5],
    other: SETTING_UNAVAILABLE_COLOR
  };
  const labels: Record<EffortState, string> = {
    disabled: "—",
    loading: "…",
    auto: "AUTO",
    low: "LOW",
    medium: "MED",
    high: "HIGH",
    xhigh: "XHIGH",
    max: "MAX",
    ultra: "ULTRA",
    other: "EFFORT"
  };
  const foreground = state === "disabled" ? "#7C8795" : "#17202B";
  const label = labels[state];
  const fontSize = label.length >= 5 ? 29 : 40;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" rx="20" fill="${colors[state]}"/>
  <rect x="4" y="4" width="136" height="136" rx="17" fill="none" stroke="${foreground}" stroke-opacity=".25" stroke-width="2"/>
  <text x="72" y="85" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="900" fill="${foreground}">${label}</text>
</svg>`;
}
