import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { textEditPlainTextLaunch } from "../src/textedit.js";

describe("TextEdit action", () => {
  it("opens a blank stdin-backed text file with TextEdit on macOS", () => {
    expect(textEditPlainTextLaunch("darwin")).toEqual({
      command: "/usr/bin/open",
      args: ["-b", "com.apple.TextEdit", "-f"]
    });
    expect(() => textEditPlainTextLaunch("win32")).toThrow(/only available on macOS/);
  });

  it("is exposed as a macOS action with its own artwork", async () => {
    const pluginRoot = fileURLToPath(new URL("../com.codexstreamdeck.agentkeys.sdPlugin/", import.meta.url));
    const manifest = JSON.parse(await readFile(`${pluginRoot}manifest.json`, "utf8")) as {
      Actions: Array<{ UUID: string; Icon: string; OS?: string[] }>;
    };
    expect(manifest.Actions.find((item) => item.UUID === "com.codexstreamdeck.agentkeys.textedit"))
      .toMatchObject({ Icon: "imgs/textedit", OS: ["mac"] });
    await access(`${pluginRoot}imgs/textedit.svg`);
    await access(`${pluginRoot}imgs/textedit@2x.svg`);
  });
});
