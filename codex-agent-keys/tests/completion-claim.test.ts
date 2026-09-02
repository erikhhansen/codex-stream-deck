import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { claimCompletion } from "../src/completion-claim.js";

describe("cross-host completion claims", () => {
  it("allows one host process to notify and suppresses the other", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-keys-claim-"));
    const now = 120_000;
    const claims = await Promise.all([
      claimCompletion("sound", "thread-1", now, directory),
      claimCompletion("sound", "thread-1", now, directory)
    ]);
    expect(claims.sort()).toEqual([false, true]);
  });

  it("keeps sound and email claims independent", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-keys-claim-"));
    expect(await claimCompletion("sound", "thread-1", 120_000, directory)).toBe(true);
    expect(await claimCompletion("email", "thread-1", 120_000, directory)).toBe(true);
  });

  it("suppresses duplicates across a time-bucket boundary", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-keys-claim-"));
    expect(await claimCompletion("sound", "thread-1", 119_999, directory)).toBe(true);
    expect(await claimCompletion("sound", "thread-1", 120_001, directory)).toBe(false);
  });
});
