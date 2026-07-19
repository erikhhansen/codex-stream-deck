import { describe, expect, it } from "vitest";

import { CodexClient } from "../src/codex-client.js";
import { readSessionActivity } from "../src/session-activity.js";

const run = process.env.RUN_CODEX_INTEGRATION === "1" ? describe : describe.skip;

run("Codex app-server reconnect", () => {
  it("can replace a live connection and list sessions again", async () => {
    const client = new CodexClient();
    const executable = process.env.CODEX_PATH || "/Applications/Codex.app/Contents/Resources/codex";
    try {
      await client.start(executable);
      expect((await client.listThreads()).length).toBeGreaterThan(0);
      await client.start(executable);
      expect((await client.listThreads()).length).toBeGreaterThan(0);
    } finally {
      await client.stop();
    }
  }, 30_000);

  it("can read cross-client activity from a selected session", async () => {
    const threadId = process.env.CODEX_THREAD_ID;
    if (!threadId) return;
    const client = new CodexClient();
    const executable = process.env.CODEX_PATH || "/Applications/Codex.app/Contents/Resources/codex";
    try {
      await client.start(executable);
      const thread = (await client.listThreads()).find((item) => item.id === threadId);
      expect(thread?.path).toBeTruthy();
      expect(["thinking", "complete", "waiting", "error"]).toContain(await readSessionActivity(thread!.path!));
    } finally {
      await client.stop();
    }
  }, 30_000);

  it("can read the authenticated account rate limits", async () => {
    const client = new CodexClient();
    const executable = process.env.CODEX_PATH || "/Applications/Codex.app/Contents/Resources/codex";
    try {
      await client.start(executable);
      const response = await client.readRateLimits();
      expect(response.rateLimits).toBeTruthy();
      expect(response.rateLimits.primary?.usedPercent ?? response.rateLimits.secondary?.usedPercent).toBeTypeOf("number");
    } finally {
      await client.stop();
    }
  }, 30_000);
});
