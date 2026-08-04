import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { captureHelperPath } from "../src/capture-helper.js";

describe("Capture to Codex action", () => {
  it("targets the installed helper inside the current user's Applications folder", () => {
    expect(captureHelperPath("/tmp/example-home")).toBe(
      "/tmp/example-home/Applications/Capture to Codex.app/Contents/MacOS/CaptureToCodex"
    );
  });

  it("is registered in the Stream Deck manifest with its artwork", async () => {
    const pluginRoot = fileURLToPath(
      new URL("../com.codexstreamdeck.agentkeys.sdPlugin/", import.meta.url)
    );
    const manifest = JSON.parse(await readFile(`${pluginRoot}manifest.json`, "utf8")) as {
      Actions: Array<{ UUID: string; Icon: string; OS?: string[] }>;
    };
    const capture = manifest.Actions.find(
      (item) => item.UUID === "com.codexstreamdeck.agentkeys.capture"
    );
    expect(capture).toMatchObject({ Icon: "imgs/capture", OS: ["mac"] });
    await access(`${pluginRoot}imgs/capture.svg`);
    await access(`${pluginRoot}imgs/capture@2x.svg`);
  });
});
