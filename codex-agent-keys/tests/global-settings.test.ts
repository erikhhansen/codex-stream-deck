import { beforeEach, describe, expect, it, vi } from "vitest";

const { isStreamDock, mkdir, readFile, setHostGlobalSettings, writeFile } = vi.hoisted(() => ({
  isStreamDock: vi.fn<() => boolean>(),
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
  setHostGlobalSettings: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("../src/host-image.js", () => ({ isStreamDock }));
vi.mock("node:fs/promises", () => ({ mkdir, readFile, writeFile }));
vi.mock("@elgato/streamdeck", () => ({
  default: {
    logger: { warn: vi.fn() },
    settings: {
      getGlobalSettings: vi.fn(),
      setGlobalSettings: setHostGlobalSettings
    }
  }
}));

import { getGlobalSettings, rememberGlobalSettings, setGlobalSettings } from "../src/global-settings.js";

describe("global settings host updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mkdir.mockResolvedValue(undefined);
    writeFile.mockResolvedValue(undefined);
    setHostGlobalSettings.mockResolvedValue(undefined);
  });

  it("keeps Stream Dock's locally selected session while accepting other host fields", async () => {
    isStreamDock.mockReturnValue(true);
    await setGlobalSettings({ activeThreadId: "local-session", codexPath: "/old/codex" });

    const accepted = rememberGlobalSettings({
      activeThreadId: "stale-session",
      codexPath: "/new/codex",
      completionEmail: "codex@example.com"
    });

    expect(accepted).toEqual({
      activeThreadId: "local-session",
      codexPath: "/new/codex",
      completionEmail: "codex@example.com"
    });
    await expect(getGlobalSettings()).resolves.toEqual(accepted);
    await vi.waitFor(() => {
      expect(writeFile).toHaveBeenLastCalledWith(
        expect.stringContaining("codex-agent-keys-settings.json"),
        JSON.stringify(accepted, null, 2)
      );
    });
  });

  it("accepts Stream Deck's selected session unchanged", () => {
    isStreamDock.mockReturnValue(false);

    expect(rememberGlobalSettings({
      activeThreadId: "host-session",
      codexPath: "/host/codex"
    })).toEqual({
      activeThreadId: "host-session",
      codexPath: "/host/codex"
    });
    expect(writeFile).not.toHaveBeenCalled();
  });
});
