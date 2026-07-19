import { describe, expect, it } from "vitest";

import { normalizeThreadId, requireThreadId } from "../src/selection.js";

describe("active session selection", () => {
  it("accepts and trims stable Codex thread IDs", () => {
    expect(normalizeThreadId(" 019f6cd7-9743-7061-bbd9-f3c8c30bc550 ")).toBe("019f6cd7-9743-7061-bbd9-f3c8c30bc550");
  });

  it("rejects unsafe or empty IDs", () => {
    expect(normalizeThreadId("codex://threads/bad")).toBe("");
    expect(() => requireThreadId(" ")).toThrow("Invalid Codex session ID");
  });
});
