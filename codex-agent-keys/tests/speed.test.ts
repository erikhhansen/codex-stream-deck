import { describe, expect, it } from "vitest";

import { renderSpeedKey, speedState } from "../src/speed.js";
import { SETTING_LEVEL_COLORS } from "../src/setting-colors.js";

describe("Codex speed key", () => {
  it("requires an explicitly selected session", () => {
    expect(speedState("", undefined)).toBe("disabled");
  });

  it("maps only the priority tier to Fast", () => {
    expect(speedState("thread", "priority")).toBe("fast");
    expect(speedState("thread", null)).toBe("standard");
    expect(speedState("thread", "default")).toBe("standard");
  });

  it("uses the Codex lightning mark only for Fast", () => {
    const fast = renderSpeedKey("fast");
    expect(fast).toContain('<path d="M83 20 42 77h26l-8 47 43-62H76z"');
    expect(fast).toContain(`fill="${SETTING_LEVEL_COLORS[5]}"`);
    const standard = renderSpeedKey("standard");
    expect(standard).toContain("STD");
    expect(standard).toContain(`fill="${SETTING_LEVEL_COLORS[0]}"`);
    expect(standard).not.toContain('<path d="M83 20');
  });
});
