import { describe, expect, it } from "vitest";

import { runtimeSettingsFromJsonl } from "../src/session-runtime-settings.js";

const context = (payload: Record<string, unknown>): string => JSON.stringify({
  timestamp: "2026-08-13T19:24:39.337Z",
  type: "turn_context",
  payload
});

describe("local session runtime settings", () => {
  it("reads model and effort without resuming the Codex thread", () => {
    expect(runtimeSettingsFromJsonl(context({ model: "gpt-5.6-sol", effort: "medium" }))).toEqual({
      model: "gpt-5.6-sol",
      reasoningEffort: "medium",
      serviceTier: null
    });
  });

  it("uses the newest context and accepts either service tier spelling", () => {
    const text = [
      context({ model: "gpt-5.6-terra", effort: "low", service_tier: "priority" }),
      "not-json",
      context({ model: "gpt-5.6-sol", effort: null, serviceTier: null })
    ].join("\n");
    expect(runtimeSettingsFromJsonl(text)).toEqual({
      model: "gpt-5.6-sol",
      reasoningEffort: null,
      serviceTier: null
    });
  });

  it("ignores unrelated events", () => {
    expect(runtimeSettingsFromJsonl(JSON.stringify({ type: "event_msg", payload: { model: "unsafe" } }))).toEqual({});
  });
});
