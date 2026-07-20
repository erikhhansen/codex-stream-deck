import { execFile } from "node:child_process";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

import {
  classifyMergeGate,
  MergeGateService,
  mergeGateOpenTarget,
  parsePullRequest,
  type CommandRunner,
  type LocalRepositoryState,
  type PullRequestState
} from "../src/merge-gate.js";
import { renderMergeGateKey } from "../src/merge-gate-renderer.js";

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

function local(overrides: Partial<LocalRepositoryState> = {}): LocalRepositoryState {
  return {
    cwd: "/tmp/repo",
    repositoryRoot: "/tmp/repo",
    branch: "feature/merge-gate",
    head: "abc123",
    dirtyCount: 0,
    conflictCount: 0,
    remoteUrl: "git@github.com:example/repo.git",
    repositoryUrl: "https://github.com/example/repo",
    ...overrides
  };
}

function pullRequest(overrides: Partial<PullRequestState> = {}): PullRequestState {
  return {
    number: 42,
    url: "https://github.com/example/repo/pull/42",
    state: "OPEN",
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "APPROVED",
    headRefOid: "abc123",
    failedChecks: [],
    pendingChecks: [],
    unknownChecks: [],
    ...overrides
  };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("Merge Gate classification", () => {
  it("uses the fixed highest-blocker precedence", () => {
    const snapshot = classifyMergeGate("thread", local({ dirtyCount: 3, conflictCount: 1 }), pullRequest({
      isDraft: true,
      failedChecks: ["test"],
      pendingChecks: ["deploy"]
    }));
    expect(snapshot.state).toBe("CONFLICT");
    expect(snapshot.count).toBe(1);
    expect(snapshot.blockerCount).toBeGreaterThan(1);
  });

  it("reports the important delivery blockers", () => {
    expect(classifyMergeGate("t", local({ dirtyCount: 2 }), pullRequest()).label).toBe("DIRTY 2");
    expect(classifyMergeGate("t", local(), pullRequest({ isDraft: true })).state).toBe("DRAFT");
    expect(classifyMergeGate("t", local(), pullRequest({ reviewDecision: "CHANGES_REQUESTED" })).state).toBe("CHANGES");
    expect(classifyMergeGate("t", local(), pullRequest({ failedChecks: ["a", "b"] })).label).toBe("CI FAIL 2");
    expect(classifyMergeGate("t", local(), pullRequest({ pendingChecks: ["a"] })).label).toBe("CI 1");
    expect(classifyMergeGate("t", local(), pullRequest({ reviewDecision: "REVIEW_REQUIRED" })).state).toBe("REVIEW");
    expect(classifyMergeGate("t", local(), pullRequest({ mergeStateStatus: "BEHIND" })).state).toBe("BEHIND");
    expect(classifyMergeGate("t", local(), pullRequest({ headRefOid: "different" })).state).toBe("STALE");
    expect(classifyMergeGate("t", local(), undefined).state).toBe("NO PR");
  });

  it("only returns MERGEABLE for the fully clear combination", () => {
    let mergeableCount = 0;
    for (let mask = 0; mask < 512; mask += 1) {
      const snapshot = classifyMergeGate("t", local({
        dirtyCount: mask & 1 ? 1 : 0,
        conflictCount: mask & 2 ? 1 : 0
      }), pullRequest({
        isDraft: Boolean(mask & 4),
        headRefOid: mask & 8 ? "stale" : "abc123",
        failedChecks: mask & 16 ? ["fail"] : [],
        pendingChecks: mask & 32 ? ["pending"] : [],
        reviewDecision: mask & 64 ? "CHANGES_REQUESTED" : "APPROVED",
        mergeable: mask & 128 ? "UNKNOWN" : "MERGEABLE",
        mergeStateStatus: mask & 256 ? "BEHIND" : "CLEAN"
      }));
      if (snapshot.state === "MERGEABLE") {
        mergeableCount += 1;
        expect(mask).toBe(0);
      }
    }
    expect(mergeableCount).toBe(1);
  });
});

describe("Merge Gate GitHub parsing", () => {
  it("normalizes check runs and status contexts", () => {
    const parsed = parsePullRequest({
      number: 42,
      url: "https://github.com/example/repo/pull/42",
      state: "OPEN",
      isDraft: false,
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      reviewDecision: "APPROVED",
      headRefOid: "abc123",
      statusCheckRollup: [
        { name: "unit", status: "COMPLETED", conclusion: "SUCCESS", detailsUrl: "https://checks/success" },
        { context: "deploy", state: "PENDING", targetUrl: "https://checks/deploy" },
        { name: "e2e", status: "COMPLETED", conclusion: "FAILURE", detailsUrl: "https://checks/fail" }
      ]
    });
    expect(parsed.failedChecks).toEqual(["e2e"]);
    expect(parsed.pendingChecks).toEqual(["deploy"]);
    expect(parsed.evidenceUrl).toBe("https://checks/fail");
  });

  it("rejects incomplete data instead of inventing a green state", () => {
    expect(() => parsePullRequest({ url: "https://github.com/example/repo/pull/42" })).toThrow("incomplete");
    const parsed = parsePullRequest({
      url: "https://github.com/example/repo/pull/42",
      state: "OPEN",
      isDraft: false,
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      reviewDecision: null,
      headRefOid: "abc123",
      statusCheckRollup: [{ name: "mystery", status: "COMPLETED", conclusion: null }]
    });
    expect(parsed.unknownChecks).toEqual(["mystery"]);
  });
});

describe("Merge Gate interaction and rendering", () => {
  it("routes local blockers to VS Code and remote blockers to evidence", () => {
    const dirty = classifyMergeGate("t", local({ dirtyCount: 1 }), pullRequest());
    expect(mergeGateOpenTarget(dirty)).toEqual({ kind: "vscode", value: "/tmp/repo" });
    expect(mergeGateOpenTarget(dirty, true)).toEqual({ kind: "url", value: "https://github.com/example/repo/pull/42" });
    const failed = classifyMergeGate("t", local(), pullRequest({ failedChecks: ["test"], evidenceUrl: "https://checks/fail" }));
    expect(mergeGateOpenTarget(failed)).toEqual({ kind: "url", value: "https://checks/fail" });
  });

  it("renders the established dominant status colors", () => {
    expect(renderMergeGateKey(classifyMergeGate("t", local(), pullRequest()))).toContain('fill="#9BE7BE"');
    expect(renderMergeGateKey(classifyMergeGate("t", local(), pullRequest({ failedChecks: ["test"] })))).toContain('fill="#FF86AC"');
    expect(renderMergeGateKey(classifyMergeGate("t", local({ dirtyCount: 2 }), pullRequest()))).toContain("DIRTY");
  });
});

describe("Merge Gate local repository inspection", () => {
  it("detects an actual dirty repository and canonicalizes its path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-keys-merge-gate-"));
    temporaryDirectories.push(directory);
    await execFileAsync("git", ["init", "-q"], { cwd: directory });
    await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: directory });
    await execFileAsync("git", ["config", "user.name", "Merge Gate Test"], { cwd: directory });
    await execFileAsync("git", ["commit", "--allow-empty", "-qm", "initial"], { cwd: directory });
    await execFileAsync("touch", ["untracked.txt"], { cwd: directory });
    const snapshot = await new MergeGateService().inspect("thread", directory);
    expect(snapshot.state).toBe("DIRTY");
    expect(snapshot.label).toBe("DIRTY 1");
    expect(snapshot.repositoryRoot).toBe(await realpath(directory));
  });

  it("guards missing targets and non-repositories", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-keys-no-repo-"));
    temporaryDirectories.push(directory);
    const service = new MergeGateService();
    expect((await service.inspect("", directory)).state).toBe("NO TARGET");
    expect((await service.inspect("thread", directory)).state).toBe("NO REPO");
  });

  it("turns GitHub's no-PR response into a compare-page target and caches it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-keys-no-pr-"));
    temporaryDirectories.push(directory);
    let githubCalls = 0;
    const run: CommandRunner = async (command, args) => {
      const operation = args.join(" ");
      if (command === "gh") {
        githubCalls += 1;
        throw new Error("no pull requests found for branch feature/test");
      }
      if (operation === "rev-parse --show-toplevel") return { stdout: directory, stderr: "" };
      if (operation === "symbolic-ref --short -q HEAD") return { stdout: "feature/test\n", stderr: "" };
      if (operation === "rev-parse HEAD") return { stdout: "abc123\n", stderr: "" };
      if (operation.startsWith("status ")) return { stdout: "", stderr: "" };
      if (operation === "remote get-url origin") return { stdout: "git@github.com:example/repo.git\n", stderr: "" };
      throw new Error(`Unexpected command: ${command} ${operation}`);
    };
    const service = new MergeGateService(run);
    const first = await service.inspect("thread", directory);
    const second = await service.inspect("thread", directory);
    expect(first.state).toBe("NO PR");
    expect(first.compareUrl).toBe("https://github.com/example/repo/compare/feature%2Ftest?expand=1");
    expect(mergeGateOpenTarget(first)).toEqual({ kind: "url", value: first.compareUrl });
    expect(second.state).toBe("NO PR");
    expect(githubCalls).toBe(1);
  });

  it("keeps a local blocker actionable when GitHub is unavailable", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-keys-gh-down-"));
    temporaryDirectories.push(directory);
    const run: CommandRunner = async (command, args) => {
      const operation = args.join(" ");
      if (command === "gh") throw new Error("gh authentication failed");
      if (operation === "rev-parse --show-toplevel") return { stdout: directory, stderr: "" };
      if (operation === "symbolic-ref --short -q HEAD") return { stdout: "feature/test\n", stderr: "" };
      if (operation === "rev-parse HEAD") return { stdout: "abc123\n", stderr: "" };
      if (operation.startsWith("status ")) return { stdout: " M changed.ts\n", stderr: "" };
      if (operation === "remote get-url origin") return { stdout: "https://github.com/example/repo.git\n", stderr: "" };
      throw new Error(`Unexpected command: ${command} ${operation}`);
    };
    const snapshot = await new MergeGateService(run).inspect("thread", directory);
    expect(snapshot.state).toBe("DIRTY");
    expect(mergeGateOpenTarget(snapshot)?.kind).toBe("vscode");
  });
});
