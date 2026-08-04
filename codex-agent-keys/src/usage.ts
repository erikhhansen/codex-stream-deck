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

export function renderUsageKey(snapshot: RateLimitSnapshot | undefined, _error = "", compactWidth?: number): string {
  const view = usageView(snapshot);
  const value = view.remaining === null ? "—" : String(view.remaining);
  if (compactWidth) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${compactWidth} 72">
  <rect width="${compactWidth}" height="72" fill="#000000"/>
  <rect width="${compactWidth}" height="72" rx="12" fill="${view.color}"/>
  <rect x="2" y="2" width="${compactWidth - 4}" height="68" rx="10" fill="none" stroke="${view.foreground}" stroke-opacity=".25" stroke-width="2"/>
  <text x="${compactWidth / 2}" y="47" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="900" fill="${view.foreground}">${value}<tspan font-size="18">%</tspan></text>
</svg>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" fill="#000000"/>
  <rect width="144" height="144" rx="20" fill="${view.color}"/>
  <rect x="4" y="4" width="136" height="136" rx="17" fill="none" stroke="${view.foreground}" stroke-opacity=".25" stroke-width="2"/>
  <text x="72" y="91" text-anchor="middle" font-family="Arial, sans-serif" font-size="62" font-weight="900" fill="${view.foreground}">${value}<tspan font-size="31">%</tspan></text>
</svg>`;
}
