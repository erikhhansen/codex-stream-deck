import { describe, expect, it } from "vitest";

import { isValidThreadId, openCodexThread } from "../src/native-launch.js";

describe("native launch validation", () => {
  it("accepts conservative Codex thread IDs", () => {
    expect(isValidThreadId("019a-dead_beef")).toBe(true);
  });

  it("rejects command-like thread IDs before spawning", () => {
    expect(isValidThreadId("abc & calc.exe")).toBe(false);
    expect(() => openCodexThread("abc & calc.exe")).toThrow(/Invalid Codex thread ID/);
  });
});
