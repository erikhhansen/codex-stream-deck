import { describe, expect, it, vi } from "vitest";

import { DesktopSettingsConvergence, type DesktopThreadSettingsWriter } from "../src/desktop-settings-convergence.js";
import type { CodexDesktopThreadSettings } from "../src/desktop-ipc.js";

class SettingsWriter implements DesktopThreadSettingsWriter {
  readonly updateThreadSettings = vi.fn<(threadId: string, settings: CodexDesktopThreadSettings) => Promise<void>>().mockResolvedValue();
}

describe("DesktopSettingsConvergence", () => {
  it("coalesces pending settings and retries the correct thread", async () => {
    const writer = new SettingsWriter();
    const convergence = new DesktopSettingsConvergence(writer);
    convergence.remember("relay", { serviceTier: "priority" });
    convergence.remember("other", { effort: "low" });
    convergence.remember("relay", { model: "gpt-5.6-terra", effort: "high" });
    convergence.remember("relay", { serviceTier: null });

    await expect(convergence.retry("relay")).resolves.toBe(true);

    expect(writer.updateThreadSettings).toHaveBeenCalledOnce();
    expect(writer.updateThreadSettings).toHaveBeenCalledWith("relay", {
      serviceTier: null,
      model: "gpt-5.6-terra",
      effort: "high"
    });
  });

  it("keeps a failed patch for the next completion and clears it after success", async () => {
    const writer = new SettingsWriter();
    writer.updateThreadSettings.mockRejectedValueOnce(new Error("desktop busy"));
    const convergence = new DesktopSettingsConvergence(writer);
    convergence.remember("relay", { effort: "ultra" });

    await expect(convergence.retry("relay")).resolves.toBe(false);
    await expect(convergence.retry("relay")).resolves.toBe(true);
    await expect(convergence.retry("relay")).resolves.toBe(false);

    expect(writer.updateThreadSettings).toHaveBeenCalledTimes(2);
    expect(writer.updateThreadSettings).toHaveBeenNthCalledWith(1, "relay", { effort: "ultra" });
    expect(writer.updateThreadSettings).toHaveBeenNthCalledWith(2, "relay", { effort: "ultra" });
  });

  it("does not clear a newer value that arrives during a successful retry", async () => {
    const writer = new SettingsWriter();
    let finishRetry: (() => void) | undefined;
    writer.updateThreadSettings.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishRetry = resolve;
    }));
    const convergence = new DesktopSettingsConvergence(writer);
    convergence.remember("relay", { effort: "high" });

    const retry = convergence.retry("relay");
    convergence.remember("relay", { effort: "ultra" });
    finishRetry?.();
    await retry;
    await convergence.retry("relay");

    expect(writer.updateThreadSettings).toHaveBeenNthCalledWith(1, "relay", { effort: "high" });
    expect(writer.updateThreadSettings).toHaveBeenNthCalledWith(2, "relay", { effort: "ultra" });
  });
});
