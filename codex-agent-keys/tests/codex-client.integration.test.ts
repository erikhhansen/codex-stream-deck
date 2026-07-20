import { describe, expect, it } from "vitest";

import { CodexClient } from "../src/codex-client.js";
import { readSessionActivity } from "../src/session-activity.js";
import { usageView } from "../src/usage.js";

const run = process.env.RUN_CODEX_INTEGRATION === "1" ? describe : describe.skip;

run("Codex app-server reconnect", () => {
  const selectedThread = async (client: CodexClient) => {
    const threads = await client.listThreads();
    return threads.find((thread) => thread.id === process.env.CODEX_THREAD_ID) ?? threads[0];
  };

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
      expect(["idle", "thinking", "complete", "error"]).toContain(await readSessionActivity(thread!.path!));
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
      const snapshot = response.rateLimitsByLimitId?.codex ?? response.rateLimits;
      const used = snapshot.primary?.usedPercent ?? snapshot.secondary?.usedPercent;
      expect(used).toBeTypeOf("number");
      const expectedRemaining = Math.round(100 - used!);
      expect([usageView(snapshot).primaryRemaining, usageView(snapshot).secondaryRemaining]).toContain(expectedRemaining);
    } finally {
      await client.stop();
    }
  }, 30_000);

  it("can read a session service tier", async () => {
    const client = new CodexClient();
    const executable = process.env.CODEX_PATH || "/Applications/Codex.app/Contents/Resources/codex";
    try {
      await client.start(executable);
      const thread = await selectedThread(client);
      expect(thread?.id).toBeTruthy();
      const tier = await client.readThreadServiceTier(thread!.id);
      expect(tier === null || typeof tier === "string").toBe(true);
    } finally {
      await client.stop();
    }
  }, 30_000);

  it("can read a session model", async () => {
    const client = new CodexClient();
    const executable = process.env.CODEX_PATH || "/Applications/Codex.app/Contents/Resources/codex";
    try {
      await client.start(executable);
      const thread = await selectedThread(client);
      expect(thread?.id).toBeTruthy();
      const settings = await client.readThreadRuntimeSettings(thread!.id);
      expect(settings.model).toBeTruthy();
    } finally {
      await client.stop();
    }
  }, 30_000);

  it("can read a session reasoning effort", async () => {
    const client = new CodexClient();
    const executable = process.env.CODEX_PATH || "/Applications/Codex.app/Contents/Resources/codex";
    try {
      await client.start(executable);
      const thread = await selectedThread(client);
      expect(thread?.id).toBeTruthy();
      const settings = await client.readThreadRuntimeSettings(thread!.id);
      expect(settings.reasoningEffort === null || typeof settings.reasoningEffort === "string").toBe(true);
    } finally {
      await client.stop();
    }
  }, 30_000);
});
