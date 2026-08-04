import { SETTING_DISABLED_COLOR, SETTING_LEVEL_COLORS, SETTING_UNAVAILABLE_COLOR } from "./setting-colors.js";

export type ModelState = "disabled" | "loading" | "sol" | "terra" | "other";

export function modelState(threadId: string, model: string | undefined): ModelState {
  if (!threadId) return "disabled";
  if (!model) return "loading";
  if (/(?:^|-)sol$/i.test(model)) return "sol";
  if (/(?:^|-)terra$/i.test(model)) return "terra";
  return "other";
}

export function shortModelLabel(model: string | undefined, state = modelState("thread", model)): string {
  if (state === "disabled") return "—";
  if (state === "loading") return "…";
  if (state === "sol") return "SOL";
  if (state === "terra" || model?.toLowerCase() === "codex-auto-review") return "TERRA";
  const normalized = model?.toLowerCase() ?? "";
  if (normalized.endsWith("-luna")) return "LUNA";
  if (normalized.endsWith("-codex-spark")) return "SPARK";
  const version = normalized.match(/^gpt-(\d+(?:\.\d+)?)(-mini)?$/);
  if (version) return version[2] ? `${version[1]}M` : version[1]!;
  return model ? model.replace(/^gpt-/i, "").toUpperCase().slice(0, 6) : "MODEL";
}

export function modelPowerLevel(model: string | undefined, state = modelState("thread", model)): number {
  if (state === "sol") return 5;
  if (state === "terra" || model?.toLowerCase() === "codex-auto-review") return 4;
  const normalized = model?.toLowerCase() ?? "";
  if (normalized.endsWith("-luna") || normalized === "gpt-5.5") return 3;
  if (normalized === "gpt-5.4") return 2;
  if (normalized.endsWith("-mini")) return 1;
  if (normalized.endsWith("-codex-spark")) return 0;
  return 2;
}

export function renderModelKey(state: ModelState, compactWidth?: number, model?: string): string {
  const disabled = state === "disabled";
  const fill = disabled
    ? SETTING_DISABLED_COLOR
    : state === "loading"
      ? SETTING_UNAVAILABLE_COLOR
      : SETTING_LEVEL_COLORS[modelPowerLevel(model, state)];
  const foreground = disabled ? "#7C8795" : "#17202B";
  const label = shortModelLabel(model, state);
  const fontSize = label.length > 3 ? 29 : 43;
  if (compactWidth) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${compactWidth} 72">
  <rect width="${compactWidth}" height="72" fill="#000000"/>
  <rect width="${compactWidth}" height="72" rx="12" fill="${fill}"/>
  <rect x="2" y="2" width="${compactWidth - 4}" height="68" rx="10" fill="none" stroke="${foreground}" stroke-opacity=".25" stroke-width="2"/>
  <text x="${compactWidth / 2}" y="45" text-anchor="middle" font-family="Arial, sans-serif" font-size="${label.length > 3 ? 25 : 31}" font-weight="900" fill="${foreground}">${label}</text>
</svg>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" fill="#000000"/>
  <rect width="144" height="144" rx="20" fill="${fill}"/>
  <rect x="4" y="4" width="136" height="136" rx="17" fill="none" stroke="${foreground}" stroke-opacity=".25" stroke-width="2"/>
  <text x="72" y="85" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="900" fill="${foreground}">${label}</text>
</svg>`;
}
