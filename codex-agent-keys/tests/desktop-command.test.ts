import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DESKTOP_COMMANDS, nativeCommandPath } from "../src/desktop-command.js";

describe("selected Codex desktop commands", () => {
  it("uses the bundled targeted-event helper", () => {
    expect(nativeCommandPath()).toMatch(/\/codex-command$/);
  });

  it("includes the guarded composer commands and their supplied key artwork", async () => {
    expect(DESKTOP_COMMANDS).toContain("do-it");
    expect(DESKTOP_COMMANDS).toContain("guide-me");
    expect(DESKTOP_COMMANDS).toContain("commit-merge-deploy");
    const nativeSource = await readFile(new URL("../native/codex-command.swift", import.meta.url), "utf8");
    expect(nativeSource).toContain('case .commitMergeDeploy: "Commit, Merge, Deploy"');
    expect(nativeSource).toContain('case .guideMe: "Guide Me"');
    expect(nativeSource).toContain("== composerText");
    expect(nativeSource).toContain("func findComposer(_ root: AXUIElement)");
    expect(nativeSource).toContain("let hinted = candidates.filter(composerHint)");
    expect(nativeSource).toContain("return textAreas.count == 1 ? textAreas[0] : nil");
    const pluginRoot = fileURLToPath(new URL("../com.codexstreamdeck.agentkeys.sdPlugin/", import.meta.url));
    const manifest = JSON.parse(await readFile(`${pluginRoot}manifest.json`, "utf8")) as {
      Actions: Array<{ UUID: string; Icon: string; OS?: string[] }>;
    };
    const action = manifest.Actions.find((item) => item.UUID === "com.codexstreamdeck.agentkeys.do-it");
    expect(action).toMatchObject({ Icon: "imgs/do-it", OS: ["mac"] });
    await access(`${pluginRoot}imgs/do-it.png`);
    await access(`${pluginRoot}imgs/do-it@2x.png`);

    const guideMeAction = manifest.Actions.find((item) => item.UUID === "com.codexstreamdeck.agentkeys.guide-me");
    expect(guideMeAction).toMatchObject({ Icon: "imgs/guide-me", OS: ["mac"] });
    await access(`${pluginRoot}imgs/guide-me.png`);
    await access(`${pluginRoot}imgs/guide-me@2x.png`);

    const commitAction = manifest.Actions.find((item) => item.UUID === "com.codexstreamdeck.agentkeys.commit-merge-deploy");
    expect(commitAction).toMatchObject({ Icon: "imgs/commit-merge-deploy", OS: ["mac"] });
    await access(`${pluginRoot}imgs/commit-merge-deploy.png`);
    await access(`${pluginRoot}imgs/commit-merge-deploy@2x.png`);
  });
});
