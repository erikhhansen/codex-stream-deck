import { describe, expect, it } from "vitest";

import { modelPowerLevel, modelState, renderModelKey, shortModelLabel } from "../src/model.js";
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
    expect(renderModelKey("terra")).toContain(`fill="${SETTING_LEVEL_COLORS[4]}"`);
    expect(renderModelKey("terra")).toContain("TERRA");
  });

  it("maps catalog models from lowest to highest power", () => {
    expect(modelPowerLevel("gpt-5.3-codex-spark")).toBe(0);
    expect(modelPowerLevel("gpt-5.4-mini")).toBe(1);
    expect(modelPowerLevel("gpt-5.4")).toBe(2);
    expect(modelPowerLevel("gpt-5.5")).toBe(3);
    expect(modelPowerLevel("gpt-5.6-luna")).toBe(3);
    expect(modelPowerLevel("gpt-5.6-terra")).toBe(4);
    expect(modelPowerLevel("codex-auto-review")).toBe(4);
    expect(modelPowerLevel("gpt-5.6-sol")).toBe(5);
  });

  it("renders useful labels for every model in the current Codex catalog", () => {
    expect(shortModelLabel("codex-auto-review")).toBe("TERRA");
    expect(shortModelLabel("gpt-5.6-luna")).toBe("LUNA");
    expect(shortModelLabel("gpt-5.5")).toBe("5.5");
    expect(shortModelLabel("gpt-5.4-mini")).toBe("5.4M");
    expect(shortModelLabel("gpt-5.3-codex-spark")).toBe("SPARK");
    expect(renderModelKey("other", 116, "gpt-5.6-luna")).toContain("LUNA");
    expect(renderModelKey("other", 116, "gpt-5.6-luna")).toContain(`fill="${SETTING_LEVEL_COLORS[3]}"`);
  });
});
