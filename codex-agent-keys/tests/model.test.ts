import { describe, expect, it } from "vitest";

import { modelState, renderModelKey } from "../src/model.js";
import { SETTING_LEVEL_COLORS } from "../src/setting-colors.js";

describe("Codex model key", () => {
  it("requires an explicitly selected session", () => {
    expect(modelState("", undefined)).toBe("disabled");
  });

  it("recognizes SOL and TERRA model families", () => {
    expect(modelState("thread", "gpt-5.6-sol")).toBe("sol");
    expect(modelState("thread", "gpt-5.6-terra")).toBe("terra");
    expect(modelState("thread", "custom-model")).toBe("other");
  });

  it("renders a distinct dominant color for each model", () => {
    expect(renderModelKey("sol")).toContain(`fill="${SETTING_LEVEL_COLORS[5]}"`);
    expect(renderModelKey("sol")).toContain("SOL");
    expect(renderModelKey("terra")).toContain(`fill="${SETTING_LEVEL_COLORS[0]}"`);
    expect(renderModelKey("terra")).toContain("TERRA");
  });
});
