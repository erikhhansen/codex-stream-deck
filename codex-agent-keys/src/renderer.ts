import type { StatusView } from "./types.js";

export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;"
  })[character] ?? "");
}

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function linesFor(name: string): string[] {
  const maxWordLength = 9;
  const maxCombinedLineLength = 6;
  const clean = name.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim() || "SESSION";
  const pending = clean.split(" ").flatMap((word) => {
    const chunks: string[] = [];
    for (let offset = 0; offset < word.length; offset += maxWordLength) {
      chunks.push(word.slice(offset, offset + maxWordLength));
    }
    return chunks;
  });
  const lines: string[] = [];
  for (const word of pending) {
    const current = lines.at(-1);
    if (current && `${current} ${word}`.length <= maxCombinedLineLength) lines[lines.length - 1] = `${current} ${word}`;
    else lines.push(word);
  }
  if (lines.length <= 3) return lines;
  return [...lines.slice(0, 2), `${lines[2]!.slice(0, 10)}…`];
}

export function wrapTitle(name: string): string {
  return linesFor(name).join("\n");
}

export function renderKey(state: StatusView, flashOn = true, selected = false): string {
  const fill = state.flashing && !flashOn ? "#FFF0B3" : state.color;
  const text = state.foreground;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" rx="20" fill="${fill}"/>
  <rect x="4" y="4" width="136" height="136" rx="17" fill="none" stroke="${text}" stroke-opacity=".25" stroke-width="2"/>
  ${selected ? '<rect x="4" y="4" width="136" height="136" rx="17" fill="none" stroke="#2878FF" stroke-width="6"/><circle cx="122" cy="21" r="8" fill="#34C978" stroke="#F7FBFF" stroke-width="3"/>' : ""}
  <text x="72" y="127" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="900" letter-spacing="1.2" fill="${text}">${escapeXml(state.label)}</text>
</svg>`;
}
