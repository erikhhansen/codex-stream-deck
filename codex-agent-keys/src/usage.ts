import { escapeXml } from "./renderer.js";
import type { RateLimitSnapshot, RateLimitWindow } from "./types.js";

export interface UsageView {
  remaining: number | null;
  primaryRemaining: number | null;
  secondaryRemaining: number | null;
  color: string;
  foreground: string;
  detail: string;
}

function remaining(window: RateLimitWindow | null | undefined): number | null {
  if (!window || !Number.isFinite(window.usedPercent)) return null;
  return Math.max(0, Math.min(100, Math.round(100 - window.usedPercent)));
}

export function usageView(snapshot: RateLimitSnapshot | undefined): UsageView {
  const primaryRemaining = remaining(snapshot?.primary);
  const secondaryRemaining = remaining(snapshot?.secondary);
  const available = [primaryRemaining, secondaryRemaining].filter((value): value is number => value !== null);
  const limiting = available.length > 0 ? Math.min(...available) : null;
  const color = limiting === null ? "#E9EEF4" : limiting < 20 ? "#FF8AAD" : limiting < 50 ? "#FFD86B" : "#A5E8C2";
  const foreground = limiting !== null && limiting < 20 ? "#3B071A" : "#17202B";
  const short = primaryRemaining === null ? "5H —" : `5H ${primaryRemaining}%`;
  const long = secondaryRemaining === null ? "WK —" : `WK ${secondaryRemaining}%`;
  return { remaining: limiting, primaryRemaining, secondaryRemaining, color, foreground, detail: `${short} · ${long}` };
}

export function renderUsageKey(snapshot: RateLimitSnapshot | undefined, error = ""): string {
  const view = usageView(snapshot);
  const value = view.remaining === null ? "—" : String(view.remaining);
  const footer = error && view.remaining === null ? "UNAVAILABLE" : view.detail;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" rx="20" fill="${view.color}"/>
  <rect x="4" y="4" width="136" height="136" rx="17" fill="none" stroke="${view.foreground}" stroke-opacity=".25" stroke-width="2"/>
  <text x="72" y="27" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="900" letter-spacing="1.3" fill="${view.foreground}">CODEX LEFT</text>
  <text x="72" y="91" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" font-weight="900" fill="${view.foreground}">${value}<tspan font-size="24">%</tspan></text>
  <text x="72" y="123" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="800" fill="${view.foreground}">${escapeXml(footer)}</text>
</svg>`;
}
