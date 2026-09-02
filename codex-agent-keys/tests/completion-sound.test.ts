import { describe, expect, it, vi } from "vitest";

vi.mock("@elgato/streamdeck", () => ({
  default: { logger: { error: vi.fn() } }
}));

import { createCompletionChime } from "../src/completion-sound.js";

describe("completion sound", () => {
  it("creates a playable, non-silent PCM WAV", () => {
    const wav = createCompletionChime();
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.subarray(8, 12).toString()).toBe("WAVE");
    expect(wav.readUInt16LE(20)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(44_100);
    expect(wav.length).toBeGreaterThan(60_000);
    expect(wav.subarray(44).some((byte) => byte !== 0)).toBe(true);
  });
});
