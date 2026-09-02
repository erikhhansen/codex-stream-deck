import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

import { githubRepositoryUrl, resolveGithubRepositoryUrl } from "../src/github.js";

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("GitHub repository navigation", () => {
  it.each([
    ["git@github.com:example/project.git", "https://github.com/example/project"],
    ["ssh://git@github.com/example/project.git", "https://github.com/example/project"],
    ["https://github.com/example/project.git", "https://github.com/example/project"],
    ["http://github.com/example/project/", "https://github.com/example/project"]
  ])("normalizes %s", (remote, expected) => {
    expect(githubRepositoryUrl(remote)).toBe(expected);
  });

  it("rejects non-GitHub and malformed remotes", () => {
    expect(githubRepositoryUrl("git@gitlab.com:example/project.git")).toBeUndefined();
    expect(githubRepositoryUrl("https://github.com/example/project/extra")).toBeUndefined();
  });

  it("resolves the selected task's origin from a nested folder", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-keys-github-"));
    temporaryDirectories.push(directory);
    await execFileAsync("/usr/bin/git", ["init", directory]);
    await execFileAsync("/usr/bin/git", ["-C", directory, "remote", "add", "origin", "git@github.com:example/project.git"]);
    const nested = join(directory, "packages", "app");
    await mkdir(nested, { recursive: true });

    expect(await resolveGithubRepositoryUrl(nested)).toBe("https://github.com/example/project");
  });
});
