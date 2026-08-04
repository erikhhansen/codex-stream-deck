import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import type { CodexClient } from "../src/codex-client.js";
import { AgentKeysController, type DesktopSettingsClient } from "../src/controller.js";
import type { CodexDesktopThreadSettings } from "../src/desktop-ipc.js";
import type { CodexModelOption, CodexThread, ThreadRuntimeSettings } from "../src/types.js";

class RuntimeSettingsClient extends EventEmitter {
  connected = true;
  readonly readThreadRuntimeSettings = vi.fn<(threadId: string) => Promise<ThreadRuntimeSettings>>();
  readonly listModels = vi.fn<() => Promise<CodexModelOption[]>>().mockResolvedValue([
    { model: "gpt-5.6-sol", displayName: "GPT-5.6-Sol", supportedReasoningEfforts: ["low", "medium", "high", "ultra"] },
    { model: "codex-auto-review", displayName: "GPT-5.6-Terra", supportedReasoningEfforts: ["low", "medium", "high"] },
    { model: "gpt-5.6-terra", displayName: "GPT-5.6-Terra", supportedReasoningEfforts: ["low", "medium", "high"] }
  ]);
  readonly listThreads = vi.fn<(archived: boolean) => Promise<CodexThread[]>>().mockResolvedValue([]);
  readonly readRateLimits = vi.fn().mockResolvedValue({ rateLimits: {} });
}

class RuntimeDesktopSettingsClient implements DesktopSettingsClient {
  readonly updateThreadSettings = vi.fn<(threadId: string, settings: CodexDesktopThreadSettings) => Promise<void>>().mockResolvedValue();
  readonly close = vi.fn();
}

describe("Agent Keys runtime settings", () => {
  it("deduplicates concurrent reads and replaces stale cached settings", async () => {
    const client = new RuntimeSettingsClient();
    let resolveFirst: ((settings: ThreadRuntimeSettings) => void) | undefined;
    client.readThreadRuntimeSettings.mockImplementationOnce(() => new Promise((resolve) => {
      resolveFirst = resolve;
    }));
    const controller = new AgentKeysController(client as unknown as CodexClient);

    const first = controller.refreshRuntimeSettings("relay");
    const concurrent = controller.refreshRuntimeSettings("relay");
    expect(client.readThreadRuntimeSettings).toHaveBeenCalledTimes(1);
    resolveFirst?.({ model: "gpt-5.6-sol", serviceTier: "priority", reasoningEffort: "ultra" });
    await Promise.all([first, concurrent]);
    expect(controller.effort("relay")).toBe("ultra");

    client.readThreadRuntimeSettings.mockResolvedValueOnce({
      model: "gpt-5.6-sol",
      serviceTier: null,
      reasoningEffort: "high"
    });
    await controller.refreshRuntimeSettings("relay");
    expect(client.readThreadRuntimeSettings).toHaveBeenCalledTimes(2);
    expect(controller.effort("relay")).toBe("high");
    expect(controller.serviceTier("relay")).toBeNull();
  });

  it("resubscribes to recover an unresolved approval after reconnect", async () => {
    const client = new RuntimeSettingsClient();
    client.listThreads.mockResolvedValueOnce([{
      id: "relay",
      status: { type: "active", activeFlags: ["waitingOnApproval"] }
    }]);
    const controller = new AgentKeysController(client as unknown as CodexClient);
    await controller.refresh();
    client.readThreadRuntimeSettings.mockImplementationOnce(async (threadId) => {
      client.emit("serverRequest", 42, "item/commandExecution/requestApproval", {
        threadId,
        availableDecisions: ["accept", "decline"]
      });
      return { model: "gpt-5.6-sol", serviceTier: "priority", reasoningEffort: "high" };
    });

    expect(await controller.recoverApproval("relay")).toBe(true);
    expect(controller.isWaitingForApproval("relay")).toBe(true);
  });

  it("retains mapped archived sessions without trying to resume them", async () => {
    const client = new RuntimeSettingsClient();
    client.listThreads.mockImplementation(async (archived = false) => archived ? [{
      id: "archived-session",
      archived: true,
      cwd: "/tmp/project",
      status: { type: "notLoaded" }
    }] : []);
    const controller = new AgentKeysController(client as unknown as CodexClient);
    controller.watchThread("archived-session");

    await controller.refresh();

    expect(controller.thread("archived-session")?.cwd).toBe("/tmp/project");
    expect(controller.state("archived-session").label).toBe("ARCHIVED");
    await expect(controller.refreshRuntimeSettings("archived-session")).rejects.toThrow("archived");
    expect(client.readThreadRuntimeSettings).not.toHaveBeenCalled();
  });

  it("sets and toggles the selected session speed", async () => {
    const client = new RuntimeSettingsClient();
    const desktop = new RuntimeDesktopSettingsClient();
    client.readThreadRuntimeSettings.mockResolvedValue({
      model: "gpt-5.6-sol",
      serviceTier: null,
      reasoningEffort: "high"
    });
    const controller = new AgentKeysController(client as unknown as CodexClient, desktop);

    await controller.toggleServiceTier("relay");
    expect(desktop.updateThreadSettings).toHaveBeenLastCalledWith("relay", { serviceTier: "priority" });
    expect(controller.serviceTier("relay")).toBe("priority");

    await controller.toggleServiceTier("relay");
    expect(desktop.updateThreadSettings).toHaveBeenLastCalledWith("relay", { serviceTier: null });
    expect(controller.serviceTier("relay")).toBeNull();
  });

  it("replays a confirmed desktop setting when its thread completes", async () => {
    vi.useFakeTimers();
    try {
      const client = new RuntimeSettingsClient();
      const desktop = new RuntimeDesktopSettingsClient();
      const controller = new AgentKeysController(client as unknown as CodexClient, desktop);
      await controller.setServiceTier("relay", "priority");

      client.emit("notification", "turn/completed", { threadId: "other" });
      await vi.advanceTimersByTimeAsync(500);
      expect(desktop.updateThreadSettings).toHaveBeenCalledTimes(1);

      client.emit("notification", "turn/completed", { threadId: "relay" });
      await vi.advanceTimersByTimeAsync(500);
      expect(desktop.updateThreadSettings).toHaveBeenCalledTimes(2);
      expect(desktop.updateThreadSettings).toHaveBeenLastCalledWith("relay", { serviceTier: "priority" });
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("does not let stale private app-server reads undo a confirmed desktop setting", async () => {
    const client = new RuntimeSettingsClient();
    const desktop = new RuntimeDesktopSettingsClient();
    client.readThreadRuntimeSettings.mockResolvedValue({
      model: "gpt-5.6-sol",
      serviceTier: null,
      reasoningEffort: "medium"
    });
    const controller = new AgentKeysController(client as unknown as CodexClient, desktop);

    await controller.setServiceTier("relay", "priority");
    await controller.refreshRuntimeSettings("relay");
    expect(controller.serviceTier("relay")).toBe("priority");

    client.readThreadRuntimeSettings.mockResolvedValueOnce({
      model: "gpt-5.6-sol",
      serviceTier: "priority",
      reasoningEffort: "medium"
    });
    await controller.refreshRuntimeSettings("relay");
    client.readThreadRuntimeSettings.mockResolvedValueOnce({
      model: "gpt-5.6-sol",
      serviceTier: null,
      reasoningEffort: "medium"
    });
    await controller.refreshRuntimeSettings("relay");
    expect(controller.serviceTier("relay")).toBeNull();
  });

  it("does not update its cache when Codex Desktop rejects a setting", async () => {
    const client = new RuntimeSettingsClient();
    const desktop = new RuntimeDesktopSettingsClient();
    desktop.updateThreadSettings.mockRejectedValueOnce(new Error("no-client-found"));
    const controller = new AgentKeysController(client as unknown as CodexClient, desktop);

    await expect(controller.setServiceTier("relay", "priority")).rejects.toThrow("no-client-found");
    expect(controller.serviceTier("relay")).toBeUndefined();
  });

  it("ignores stale settings notifications until the desktop write converges", async () => {
    const client = new RuntimeSettingsClient();
    const desktop = new RuntimeDesktopSettingsClient();
    const controller = new AgentKeysController(client as unknown as CodexClient, desktop);

    await controller.setServiceTier("relay", "priority");
    client.emit("notification", "thread/settings/updated", {
      threadId: "relay",
      threadSettings: { serviceTier: null }
    });
    expect(controller.serviceTier("relay")).toBe("priority");

    client.emit("notification", "thread/settings/updated", {
      threadId: "relay",
      threadSettings: { serviceTier: "priority" }
    });
    client.emit("notification", "thread/settings/updated", {
      threadId: "relay",
      threadSettings: { serviceTier: null }
    });
    expect(controller.serviceTier("relay")).toBeNull();
  });

  it("cycles models in either direction using the live model catalog", async () => {
    const client = new RuntimeSettingsClient();
    const desktop = new RuntimeDesktopSettingsClient();
    client.readThreadRuntimeSettings.mockResolvedValue({
      model: "gpt-5.6-sol",
      serviceTier: null,
      reasoningEffort: "high"
    });
    const controller = new AgentKeysController(client as unknown as CodexClient, desktop);

    await controller.cycleModel("relay", 1);
    expect(desktop.updateThreadSettings).toHaveBeenLastCalledWith("relay", { model: "gpt-5.6-terra", effort: "high" });
    await controller.cycleModel("relay", -1);
    expect(desktop.updateThreadSettings).toHaveBeenLastCalledWith("relay", { model: "gpt-5.6-sol", effort: "high" });
  });

  it("keeps effort valid when the next model supports fewer levels", async () => {
    const client = new RuntimeSettingsClient();
    const desktop = new RuntimeDesktopSettingsClient();
    client.readThreadRuntimeSettings.mockResolvedValue({
      model: "gpt-5.6-sol",
      serviceTier: null,
      reasoningEffort: "ultra"
    });
    const controller = new AgentKeysController(client as unknown as CodexClient, desktop);

    await controller.cycleModel("relay", 1);

    expect(desktop.updateThreadSettings).toHaveBeenLastCalledWith("relay", { model: "gpt-5.6-terra", effort: "high" });
    expect(controller.effort("relay")).toBe("high");
  });

  it("cycles only through effort levels supported by the active model", async () => {
    const client = new RuntimeSettingsClient();
    const desktop = new RuntimeDesktopSettingsClient();
    client.readThreadRuntimeSettings.mockResolvedValue({
      model: "gpt-5.6-terra",
      serviceTier: null,
      reasoningEffort: "medium"
    });
    const controller = new AgentKeysController(client as unknown as CodexClient, desktop);

    await controller.cycleEffort("relay", 1);
    expect(desktop.updateThreadSettings).toHaveBeenLastCalledWith("relay", { effort: "high" });
    await controller.cycleEffort("relay", 1);
    expect(desktop.updateThreadSettings).toHaveBeenLastCalledWith("relay", { effort: "low" });
  });

  it("resolves a deduplicated model alias before cycling effort", async () => {
    const client = new RuntimeSettingsClient();
    const desktop = new RuntimeDesktopSettingsClient();
    client.readThreadRuntimeSettings.mockResolvedValue({
      model: "codex-auto-review",
      serviceTier: null,
      reasoningEffort: "medium"
    });
    const controller = new AgentKeysController(client as unknown as CodexClient, desktop);

    await controller.cycleEffort("relay", 1);

    expect(desktop.updateThreadSettings).toHaveBeenLastCalledWith("relay", { effort: "high" });
  });
});
