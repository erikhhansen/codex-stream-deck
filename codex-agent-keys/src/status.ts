import type { CodexThread, ConnectionState, LocalActivity, StatusView } from "./types.js";

const view = (status: StatusView["status"], label: string, color: string, foreground: string, flashing = false): StatusView => ({
  status,
  label,
  color,
  foreground,
  flashing
});

export function statusFor(
  thread: CodexThread | undefined,
  connection: ConnectionState,
  recentlyCompleted: boolean,
  localActivity?: LocalActivity
): StatusView {
  if (connection === "error") return view("error", "ERROR", "#FF86AC", "#2B0A17");
  if (!thread) return view("unassigned", "UNASSIGNED", "#BBC4D1", "#141A22");

  const type = thread.status?.type ?? "notLoaded";
  const flags = thread.status?.activeFlags ?? [];
  if (type === "systemError" || type === "system_error") return view("error", "ERROR", "#FF86AC", "#2B0A17");
  if (flags.includes("waitingOnApproval")) return view("waiting", "APPROVAL", "#FFD86B", "#2B2307", true);
  if (flags.includes("waitingOnUserInput")) return view("waiting", "NEEDS INPUT", "#FFD86B", "#2B2307", true);
  if (localActivity === "error") return view("error", "ERROR", "#FF86AC", "#2B0A17");
  if (localActivity === "thinking") return view("thinking", "THINKING", "#8BB7FF", "#0B203D");
  if (recentlyCompleted || localActivity === "complete") return view("complete", "COMPLETE", "#9BE7BE", "#0B291A");
  if (localActivity === "waiting" && type === "idle") return view("waiting", "WAITING", "#FFD86B", "#2B2307", true);
  if (type === "active" || type === "inProgress") return view("thinking", "THINKING", "#8BB7FF", "#0B203D");
  if (type === "idle") return view("waiting", "WAITING", "#FFD86B", "#2B2307", true);
  return view("idle", "IDLE", "#F2F5F8", "#17202B");
}
