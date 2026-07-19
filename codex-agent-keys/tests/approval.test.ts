import { describe, expect, it } from "vitest";

import { approvalResponse, parseApprovalRequest } from "../src/approval.js";

describe("Codex approval protocol", () => {
  it("binds a v2 command request to its exact request and task IDs", () => {
    expect(parseApprovalRequest(41, "item/commandExecution/requestApproval", {
      threadId: "thread-a",
      availableDecisions: ["accept", "decline"]
    })).toMatchObject({ id: 41, method: "item/commandExecution/requestApproval", threadId: "thread-a" });
  });

  it("maps v2 approve and reject without keyboard shortcuts", () => {
    const pending = parseApprovalRequest("request-7", "item/fileChange/requestApproval", { threadId: "thread-b" })!;
    expect(approvalResponse(pending, "approve")).toEqual({ decision: "accept" });
    expect(approvalResponse(pending, "reject")).toEqual({ decision: "decline" });
  });

  it("maps legacy approval responses correctly", () => {
    const pending = parseApprovalRequest(9, "execCommandApproval", { conversationId: "thread-c" })!;
    expect(approvalResponse(pending, "approve")).toEqual({ decision: "approved" });
    expect(approvalResponse(pending, "reject")).toEqual({ decision: "denied" });
  });

  it("refuses unsupported and malformed server requests", () => {
    expect(parseApprovalRequest(1, "item/permissions/requestApproval", { threadId: "thread-a" })).toBeUndefined();
    expect(parseApprovalRequest(2, "item/fileChange/requestApproval", {})).toBeUndefined();
  });

  it("respects the decisions offered by Codex", () => {
    const pending = parseApprovalRequest(3, "item/commandExecution/requestApproval", {
      threadId: "thread-a",
      availableDecisions: ["decline"]
    })!;
    expect(approvalResponse(pending, "approve")).toBeUndefined();
    expect(approvalResponse(pending, "reject")).toEqual({ decision: "decline" });
  });
});
