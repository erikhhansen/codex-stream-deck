import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { resolveRepositoryRoot } from "../src/vscode.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("VS Code project resolution", () => {
  it("falls back to a valid non-Git working directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-keys-vscode-"));
    temporaryDirectories.push(directory);
    expect(await resolveRepositoryRoot(directory)).toBe(directory);
  });

  it("rejects an unavailable working directory", async () => {
    await expect(resolveRepositoryRoot(join(tmpdir(), "agent-keys-does-not-exist"))).rejects.toThrow("unavailable");
  });
});
