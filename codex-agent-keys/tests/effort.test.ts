import { describe, expect, it } from "vitest";

import { effortState, renderEffortKey } from "../src/effort.js";
import { SETTING_LEVEL_COLORS } from "../src/setting-colors.js";

describe("Codex effort key", () => {
  it("requires an explicitly selected session", () => {
    expect(effortState("", undefined)).toBe("disabled");
  });

  it("recognizes advertised effort levels", () => {
    expect(effortState("thread", "low")).toBe("low");
    expect(effortState("thread", "medium")).toBe("medium");
    expect(effortState("thread", "xhigh")).toBe("xhigh");
    expect(effortState("thread", "ultra")).toBe("ultra");
  });

  it("gives each high-end level a distinct key face", () => {
    expect(renderEffortKey("high")).toContain("HIGH");
    expect(renderEffortKey("high")).toContain(`fill="${SETTING_LEVEL_COLORS[2]}"`);
    expect(renderEffortKey("max")).toContain("MAX");
    expect(renderEffortKey("ultra")).toContain("ULTRA");
    expect(renderEffortKey("ultra")).toContain(`fill="${SETTING_LEVEL_COLORS[5]}"`);
  });

  it("shares its endpoints with the speed and model scales", () => {
    expect(renderEffortKey("low")).toContain(`fill="${SETTING_LEVEL_COLORS[0]}"`);
    expect(renderEffortKey("ultra")).toContain(`fill="${SETTING_LEVEL_COLORS[5]}"`);
  });
});
