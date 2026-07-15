import { describe, expect, it } from "vitest";

import type { CodexThread, StatusEnvelope, ThreadState } from "../src/domain.js";
import { choosePrimaryThread, projectDisplayName } from "../src/project-model.js";

function thread(id: string, recency: number, status = "notLoaded"): CodexThread {
  return {
    id,
    preview: id,
    name: null,
    cwd: "C:\\repo",
    ephemeral: false,
    createdAt: recency,
    updatedAt: recency,
    recencyAt: recency,
    status: { type: status, activeFlags: [] },
    source: "cli"
  };
}

function state(value: CodexThread, report?: StatusEnvelope): ThreadState {
  return {
    thread: value,
    projectId: "sha256:abc",
    projectRoot: "C:\\repo",
    identityAnchor: "C:\\repo\\.git",
    ...(report ? { report } : {})
  };
}

describe("primary thread selection", () => {
  it("prefers a pinned thread over recency", () => {
    const older = state(thread("older", 1));
    const newer = state(thread("newer", 2));
    expect(choosePrimaryThread([older, newer], "older").thread.id).toBe("older");
  });

  it("prefers an approval wait over a newer idle thread", () => {
    const waitingThread = thread("waiting", 1, "active");
    waitingThread.status.activeFlags = ["waitingOnApproval"];
    expect(choosePrimaryThread([state(waitingThread), state(thread("newer", 2))]).thread.id).toBe("waiting");
  });
});

describe("project display names", () => {
  it("uses the descriptive Codex task title instead of a short generated folder name", () => {
    const value = thread("named", 1);
    value.name = "Find social posting outlier";
    value.preview = "am i the only one who does not post there?";
    expect(projectDisplayName(value, "C:\\Codex\\am")).toBe("Find social posting outlier");
  });

  it("falls back to the task preview when Codex has no title", () => {
    const value = thread("preview", 1);
    value.preview = "Create a clearer project dashboard";
    expect(projectDisplayName(value, "C:\\Codex\\i")).toBe("Create a clearer project dashboard");
  });
});
