import { describe, expect, it } from "vitest";

import { renderKey, wrapTitle } from "../src/renderer.js";
import { statusFor } from "../src/status.js";

describe("session key renderer", () => {
  it("makes the status color the dominant key color", () => {
    const state = statusFor({ id: "1", status: { type: "active" } }, "connected", false);
    const svg = renderKey(state);
    expect(svg).toContain('fill="#8BB7FF"');
    expect(svg).not.toContain('fill="#07101D"');
  });

  it("keeps a short native title on one line", () => {
    expect(wrapTitle("Resolve")).toBe("Resolve");
  });

  it("wraps Stream Deck so it does not clip", () => {
    expect(wrapTitle("Stream Deck")).toBe("Stream\nDeck");
  });

  it("wraps short but visually wide multi-word names", () => {
    expect(wrapTitle("Web SDC")).toBe("Web\nSDC");
  });

  it("wraps a long native title onto readable lines", () => {
    expect(wrapTitle("Customer Portal Migration")).toBe("Customer\nPortal\nMigration");
  });

  it("changes dominant colors across flash phases", () => {
    const state = statusFor({ id: "1", status: { type: "idle", activeFlags: ["waitingOnUserInput"] } }, "connected", false);
    expect(renderKey(state, true)).toContain('fill="#FFD86B"');
    expect(renderKey(state, false)).toContain('fill="#FFF0B3"');
    expect(renderKey(state, false)).toContain('fill="#2B2307"');
  });

  it("adds a separate accent border and green dot for the active target", () => {
    const state = statusFor({ id: "1", status: { type: "active" } }, "connected", false);
    expect(renderKey(state, true, false)).not.toContain('stroke="#2878FF"');
    const selected = renderKey(state, true, true);
    expect(selected).toContain('stroke="#2878FF"');
    expect(selected).toContain('fill="#34C978"');
  });
});
