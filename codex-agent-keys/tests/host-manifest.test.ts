import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

// @ts-expect-error The packaging helper is intentionally plain JavaScript.
import { manifestForHost } from "../scripts/host-manifest.mjs";

const source = JSON.parse(await readFile(
  new URL("../com.codexstreamdeck.agentkeys.sdPlugin/manifest.json", import.meta.url),
  "utf8"
));

describe("host manifests", () => {
  it("keeps the modern Stream Deck contract", () => {
    const manifest = manifestForHost(source, "streamdeck");
    expect(manifest.SDKVersion).toBe(3);
    expect(manifest.Nodejs.Version).toBe("24");
    expect(manifest.CodePath).toBe("bin/plugin.js");
    expect(manifest.CodePathMac).toBeUndefined();
    expect(new Set(manifest.Actions.flatMap((action: { Controllers?: string[] }) => action.Controllers ?? [])))
      .toContain("Encoder");
  });

  it("generates the legacy Stream Dock contract without changing actions", () => {
    const manifest = manifestForHost(source, "streamdock");
    expect(manifest.SDKVersion).toBe(1);
    expect(manifest.Nodejs.Version).toBe("20");
    expect(manifest.CodePath).toBeUndefined();
    expect(manifest.CodePathMac).toBe("bin/plugin.js");
    expect(manifest.Actions.map((action: { UUID: string }) => action.UUID))
      .toEqual(source.Actions.map((action: { UUID: string }) => action.UUID));
    expect(new Set(manifest.Actions.flatMap((action: { Controllers?: string[] }) => action.Controllers ?? [])))
      .toContain("Knob");
  });
});
