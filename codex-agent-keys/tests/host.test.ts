import { afterEach, describe, expect, it, vi } from "vitest";

const application = vi.hoisted(() => ({ version: "7.1.0" }));
vi.mock("@elgato/streamdeck", () => ({
  default: { info: { application } }
}));

import { agentKeysHost, isStreamDock } from "../src/host.js";

describe("Agent Keys host detection", () => {
  afterEach(() => {
    delete process.env.CODEX_AGENT_KEYS_HOST;
    application.version = "7.1.0";
  });

  it("uses the modern Stream Deck host for 7.x", () => {
    expect(agentKeysHost()).toBe("streamdeck");
    expect(isStreamDock()).toBe(false);
  });

  it("uses the compatibility Stream Dock host for 3.x", () => {
    application.version = "3.10.188.226";
    expect(agentKeysHost()).toBe("streamdock");
    expect(isStreamDock()).toBe(true);
  });

  it("accepts an explicit host override", () => {
    process.env.CODEX_AGENT_KEYS_HOST = "streamdock";
    expect(agentKeysHost()).toBe("streamdock");
  });
});
