export type RpcId = number | string;
export type ApprovalChoice = "approve" | "reject";

export const APPROVAL_METHODS = [
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
  "execCommandApproval",
  "applyPatchApproval"
] as const;

export type ApprovalMethod = typeof APPROVAL_METHODS[number];

export interface PendingApproval {
  id: RpcId;
  method: ApprovalMethod;
  threadId: string;
  params: Record<string, unknown>;
}

function isApprovalMethod(method: string): method is ApprovalMethod {
  return (APPROVAL_METHODS as readonly string[]).includes(method);
}

export function parseApprovalRequest(
  id: RpcId,
  method: string,
  params: Record<string, unknown>
): PendingApproval | undefined {
  if (!isApprovalMethod(method)) return undefined;
  const candidate = method.startsWith("item/") ? params.threadId : params.conversationId;
  if (typeof candidate !== "string" || !candidate.trim()) return undefined;
  return { id, method, threadId: candidate.trim(), params };
}

export function approvalResponse(
  approval: PendingApproval,
  choice: ApprovalChoice
): Record<string, unknown> | undefined {
  if (approval.method.startsWith("item/")) {
    const decision = choice === "approve" ? "accept" : "decline";
    const available = approval.params.availableDecisions;
    if (Array.isArray(available) && !available.includes(decision)) return undefined;
    return { decision };
  }
  return { decision: choice === "approve" ? "approved" : "denied" };
}
