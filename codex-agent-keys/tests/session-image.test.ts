import { describe, expect, it } from "vitest";

import { sessionImageStem } from "../src/session-image.js";

describe("sessionImageStem", () => {
  it("marks the selected state", () => {
    expect(sessionImageStem({ status: "idle", label: "IDLE", color: "#fff", foreground: "#000", flashing: false }, true, true))
      .toBe("idle-selected");
  });

  it("marks the alternate flashing frame", () => {
    expect(sessionImageStem({ status: "waiting", label: "NEEDS INPUT", color: "#fff", foreground: "#000", flashing: true }, false, false))
      .toBe("needs-input-flash");
  });
});
