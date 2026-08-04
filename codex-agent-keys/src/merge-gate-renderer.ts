import type { MergeGateSnapshot, MergeGateState } from "./merge-gate.js";
import { escapeXml } from "./renderer.js";

const COLORS: Record<"neutral" | "warning" | "danger" | "success", { fill: string; text: string }> = {
  neutral: { fill: "#F2F5F8", text: "#17202B" },
  warning: { fill: "#FFD86B", text: "#2B2307" },
  danger: { fill: "#FF86AC", text: "#2B0A17" },
  success: { fill: "#9BE7BE", text: "#0B291A" }
};

function tone(state: MergeGateState): keyof typeof COLORS {
  if (state === "MERGEABLE") return "success";
  if (["CONFLICT", "CHANGES", "CI FAIL"].includes(state)) return "danger";
  if (["DIRTY", "STALE", "DRAFT", "CI", "REVIEW", "BEHIND", "BLOCKED"].includes(state)) return "warning";
  return "neutral";
}

function displayLines(snapshot: MergeGateSnapshot): [string, string | undefined] {
  if (snapshot.state === "CI FAIL") return ["CI FAIL", snapshot.count ? String(snapshot.count) : undefined];
  if (snapshot.state === "DIRTY") return ["DIRTY", snapshot.count ? String(snapshot.count) : undefined];
  if (snapshot.state === "CI") return ["CI", snapshot.count ? String(snapshot.count) : undefined];
  if (snapshot.state === "NO TARGET") return ["NO", "TARGET"];
  if (snapshot.state === "NO REPO") return ["NO", "REPO"];
  if (snapshot.state === "NO PR") return ["NO", "PR"];
  return [snapshot.state, undefined];
}

export function renderMergeGateKey(snapshot: MergeGateSnapshot, compactWidth?: number): string {
  const palette = COLORS[tone(snapshot.state)];
  const [primary, secondary] = displayLines(snapshot);
  const primaryY = secondary ? 65 : 78;
  const secondaryY = 104;
  const fontSize = primary.length > 8 ? 24 : primary.length > 6 ? 28 : 34;
  const additionalBlockers = Math.max(0, snapshot.blockerCount - 1);
  if (compactWidth) {
    const label = snapshot.state;
    const compactFontSize = label.length > 8 ? 15 : label.length > 6 ? 18 : 23;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${compactWidth} 72">
  <rect width="${compactWidth}" height="72" fill="#000000"/>
  <rect width="${compactWidth}" height="72" rx="12" fill="${palette.fill}"/>
  <rect x="2" y="2" width="${compactWidth - 4}" height="68" rx="10" fill="none" stroke="${palette.text}" stroke-opacity=".25" stroke-width="2"/>
  <text x="${compactWidth / 2}" y="43" text-anchor="middle" font-family="Arial, sans-serif" font-size="${compactFontSize}" font-weight="900" fill="${palette.text}">${escapeXml(label)}</text>
  ${snapshot.count ? `<text x="${compactWidth / 2}" y="62" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="900" fill="${palette.text}">${snapshot.count}</text>` : ""}
</svg>`;
  }
  const pathArrow = secondary
    ? ""
    : `<path d="M34 28v17c0 9 7 16 16 16h44c9 0 16 7 16 16v8" fill="none" stroke="${palette.text}" stroke-width="7" stroke-linecap="round"/>
  <path d="m99 77 11 11 17-21" fill="none" stroke="${palette.text}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" fill="#000000"/>
  <rect width="144" height="144" rx="20" fill="${palette.fill}"/>
  <rect x="4" y="4" width="136" height="136" rx="17" fill="none" stroke="${palette.text}" stroke-opacity=".25" stroke-width="2"/>
  ${pathArrow}
  ${additionalBlockers ? `<circle cx="121" cy="22" r="15" fill="${palette.text}"/><text x="121" y="23" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="13" font-weight="900" fill="${palette.fill}">+${additionalBlockers}</text>` : ""}
  <text x="72" y="${primaryY}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="900" letter-spacing="-.8" fill="${palette.text}">${escapeXml(primary)}</text>
  ${secondary ? `<text x="72" y="${secondaryY}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="30" font-weight="900" fill="${palette.text}">${escapeXml(secondary)}</text>` : ""}
  <text x="72" y="128" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="900" letter-spacing="1.4" fill="${palette.text}">MERGE GATE</text>
</svg>`;
}
