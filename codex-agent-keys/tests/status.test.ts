import { describe, expect, it } from "vitest";

import { statusFor } from "../src/status.js";
import type { CodexThread } from "../src/types.js";

const thread = (type: string, activeFlags: string[] = []): CodexThread => ({
  id: "thread-1",
  name: "Build",
  status: { type, activeFlags }
});

describe("minimal session status", () => {
  it("uses white for a session that is not loaded", () => {
    expect(statusFor(thread("notLoaded"), "connected", false)).toMatchObject({ status: "idle", color: "#F2F5F8" });
  });

  it("uses blue while Codex is working", () => {
    expect(statusFor(thread("active"), "connected", false)).toMatchObject({ status: "thinking", color: "#8BB7FF" });
  });

  it("uses local session activity when a separate app-server incorrectly reports idle", () => {
    expect(statusFor(thread("idle"), "connected", false, "thinking")).toMatchObject({ status: "thinking", color: "#8BB7FF" });
  });

  it("uses green briefly after a completed turn", () => {
    expect(statusFor(thread("idle"), "connected", true)).toMatchObject({ status: "complete", color: "#9BE7BE" });
  });

  it("flashes yellow when approval or user input is needed", () => {
    expect(statusFor(thread("active", ["waitingOnApproval"]), "connected", false)).toMatchObject({ status: "waiting", flashing: true });
    expect(statusFor(thread("active", ["waitingOnUserInput"]), "connected", false)).toMatchObject({ status: "waiting", flashing: true });
  });

  it("treats an idle loaded session as waiting for the user to continue", () => {
    expect(statusFor(thread("idle"), "connected", false)).toMatchObject({ label: "WAITING", flashing: true });
  });
});
