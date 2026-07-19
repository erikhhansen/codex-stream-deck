const THREAD_ID = /^[A-Za-z0-9_-]{1,200}$/;

export function normalizeThreadId(value: unknown): string {
  if (typeof value !== "string") return "";
  const candidate = value.trim();
  return THREAD_ID.test(candidate) ? candidate : "";
}

export function requireThreadId(value: unknown): string {
  const threadId = normalizeThreadId(value);
  if (!threadId) throw new Error("Invalid Codex session ID");
  return threadId;
}
