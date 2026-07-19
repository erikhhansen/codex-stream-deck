import { describe, expect, it } from "vitest";

import { renderUsageKey, usageView } from "../src/usage.js";

describe("Codex usage key", () => {
  it("shows the most constrained remaining allowance", () => {
    const view = usageView({ primary: { usedPercent: 18 }, secondary: { usedPercent: 61 } });
    expect(view.remaining).toBe(39);
    expect(view.detail).toBe("5H 82% · WK 39%");
  });

  it("clamps malformed percentages to the display range", () => {
    expect(usageView({ primary: { usedPercent: -5 } }).remaining).toBe(100);
    expect(usageView({ primary: { usedPercent: 120 } }).remaining).toBe(0);
  });

  it("renders an unavailable state without inventing usage", () => {
    const svg = renderUsageKey(undefined, "not connected");
    expect(svg).toContain("—");
    expect(svg).not.toContain("CODEX LEFT");
    expect(svg).not.toContain("UNAVAILABLE");
  });

  it("keeps the key face limited to the large percentage", () => {
    const svg = renderUsageKey({ primary: { usedPercent: 18 }, secondary: { usedPercent: 61 } });
    expect(svg).toContain("39");
    expect(svg).not.toContain("5H");
    expect(svg).not.toContain("WK");
  });

  it("changes the dominant color as the remaining allowance falls", () => {
    expect(renderUsageKey({ primary: { usedPercent: 10 } })).toContain('fill="#A5E8C2"');
    expect(renderUsageKey({ primary: { usedPercent: 70 } })).toContain('fill="#FFD86B"');
    expect(renderUsageKey({ primary: { usedPercent: 90 } })).toContain('fill="#FF8AAD"');
  });
});
