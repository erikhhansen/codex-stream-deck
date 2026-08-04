import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputDirectory = resolve(scriptDirectory, "../com.codexstreamdeck.agentkeys.sdPlugin/imgs/session-states");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "codex-streamdock-session-"));

const states = [
  { label: "UNASSIGNED", color: "#BBC4D1", foreground: "#141A22", flashing: false },
  { label: "ARCHIVED", color: "#BBC4D1", foreground: "#141A22", flashing: false },
  { label: "ERROR", color: "#FF86AC", foreground: "#2B0A17", flashing: false },
  { label: "APPROVAL", color: "#FFD86B", foreground: "#2B2307", flashing: true },
  { label: "NEEDS INPUT", color: "#FFD86B", foreground: "#2B2307", flashing: true },
  { label: "THINKING", color: "#8BB7FF", foreground: "#0B203D", flashing: false },
  { label: "COMPLETE", color: "#9BE7BE", foreground: "#0B291A", flashing: false },
  { label: "IDLE", color: "#F2F5F8", foreground: "#17202B", flashing: false }
];

function escapeXml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
  })[character]);
}

function stemFor(state, flashOn, selected) {
  const label = state.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const flash = state.flashing && !flashOn ? "-flash" : "";
  return `${label}${flash}${selected ? "-selected" : ""}`;
}

function render(state, flashOn, selected) {
  const fill = state.flashing && !flashOn ? "#FFF0B3" : state.color;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144">
  <rect width="144" height="144" fill="#000000"/>
  <rect width="144" height="144" rx="20" fill="${fill}"/>
  <rect x="4" y="4" width="136" height="136" rx="17" fill="none" stroke="${state.foreground}" stroke-opacity=".25" stroke-width="2"/>
  ${selected ? '<rect x="4" y="4" width="136" height="136" rx="17" fill="none" stroke="#2878FF" stroke-width="6"/><circle cx="122" cy="21" r="8" fill="#34C978" stroke="#F7FBFF" stroke-width="3"/>' : ""}
  <text x="72" y="127" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="900" letter-spacing="1.2" fill="${state.foreground}">${escapeXml(state.label)}</text>
</svg>`;
}

mkdirSync(outputDirectory, { recursive: true });
try {
  for (const state of states) {
    for (const flashOn of state.flashing ? [true, false] : [true]) {
      for (const selected of [false, true]) {
        const stem = stemFor(state, flashOn, selected);
        const svgPath = join(temporaryDirectory, `${stem}.svg`);
        writeFileSync(svgPath, render(state, flashOn, selected));
        execFileSync("/usr/bin/qlmanage", ["-t", "-s", "144", "-o", temporaryDirectory, svgPath], { stdio: "ignore" });
        copyFileSync(`${svgPath}.png`, join(outputDirectory, `${stem}.png`));
      }
    }
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
