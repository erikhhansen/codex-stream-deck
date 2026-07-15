import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { parseNotifyEvent } from "../src/notify-bridge.js";
import { splitProjectName } from "../src/renderer.js";
import { normalizeGlobalSettings, normalizeSlotSettings, normalizeTargetSettings } from "../src/settings.js";

describe("security boundaries", () => {
  it("normalizes untrusted global settings without truthy coercion", () => {
    const settings = normalizeGlobalSettings({
      codexPath: "bad\0path",
      includeExecThreads: "yes" as unknown as boolean,
      notifyBridgeEnabled: "no" as unknown as boolean,
      freshMinutes: 120,
      staleMinutes: 2,
      sourceKinds: [" appServer ", `bad\0kind`, "x".repeat(100)]
    });
    expect(settings.codexPath).toBe("codex");
    expect(settings.includeExecThreads).toBe(false);
    expect(settings.notifyBridgeEnabled).toBe(true);
    expect(settings.staleMinutes).toBe(121);
    expect(settings.sourceKinds).toEqual(["appServer", "x".repeat(64)]);
  });

  it("bounds action settings and removes control characters", () => {
    const slot = normalizeSlotSettings({
      pinnedThreadId: "../../thread",
      pinnedProjectRoot: "bad\0root",
      displayNameOverride: "hello\u0001world"
    });
    const target = normalizeTargetSettings({ slotIndex: 100, prompt: `safe\0${"x".repeat(20_000)}` });
    expect(slot.pinnedThreadId).toBe("");
    expect(slot.pinnedProjectRoot).toBe("");
    expect(slot.displayNameOverride).toBe("hello world");
    expect(target.slotIndex).toBe(31);
    expect(target.prompt).not.toContain("\0");
    expect(target.prompt.length).toBe(16_000);
    expect(splitProjectName("safe\u0001title").join(" ")).not.toContain("\u0001");
  });

  it("accepts only bounded, versioned local notify events", () => {
    const base = {
      version: 1,
      type: "agent-turn-complete",
      threadId: "thread_123",
      turnId: "turn_123",
      cwd: process.cwd(),
      observedAt: new Date().toISOString()
    };
    expect(parseNotifyEvent(base).threadId).toBe("thread_123");
    expect(() => parseNotifyEvent({ ...base, version: 2 })).toThrow(/version/i);
    expect(() => parseNotifyEvent({ ...base, type: "unknown" })).toThrow(/event type/i);
    expect(() => parseNotifyEvent({ ...base, threadId: "../escape" })).toThrow(/thread or turn ID/i);
    expect(() => parseNotifyEvent({ ...base, cwd: "relative/path" })).toThrow(/absolute cwd/i);
  });

  it("truncates multi-byte notify messages by UTF-8 byte length", () => {
    const event = parseNotifyEvent({
      version: 1,
      type: "agent-turn-complete",
      threadId: "thread_123",
      turnId: "turn_123",
      cwd: process.cwd(),
      observedAt: new Date().toISOString(),
      lastAssistantMessage: "😀".repeat(100_000)
    });
    expect(Buffer.byteLength(event.lastAssistantMessage ?? "", "utf8")).toBeLessThanOrEqual(192 * 1024);
    expect(event.lastAssistantMessage).not.toContain("�");
  });

  it("ships the Property Inspector with a restrictive content policy", async () => {
    const html = await readFile("com.codexstreamdeck.control.sdPlugin/ui/property-inspector.html", "utf8");
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("connect-src ws://127.0.0.1:*");
  });
});
