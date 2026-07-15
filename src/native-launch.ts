import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";

const THREAD_ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

export function isValidThreadId(threadId: string): boolean {
  return THREAD_ID_PATTERN.test(threadId);
}

function launch(command: string, args: string[]): void {
  if (command.includes("\0") || args.some((argument) => argument.includes("\0"))) throw new Error("Invalid null byte in launch argument");
  const child = spawn(command, args, { shell: false, detached: true, stdio: "ignore", windowsHide: true });
  child.once("error", () => undefined);
  child.unref();
}

export function openCodexUrl(url: string): void {
  if (url.includes("\0") || url.length > 65_536) throw new Error("Refused invalid Codex deep link");
  const parsed = new URL(url);
  if (parsed.protocol !== "codex:") throw new Error("Refused invalid Codex deep link");
  const pathValue = parsed.pathname.replace(/^\//, "");
  const valid =
    (parsed.hostname === "threads" && (pathValue === "new" || isValidThreadId(pathValue))) ||
    (parsed.hostname === "new" && !!parsed.search) ||
    (parsed.hostname === "settings" && !/\.\.|\\/.test(pathValue)) ||
    (parsed.hostname === "skills" && !pathValue) ||
    (parsed.hostname === "automations" && !pathValue);
  if (!valid) throw new Error("Refused invalid Codex deep link");
  if (process.platform === "darwin") launch("/usr/bin/open", [url]);
  else if (process.platform === "win32") launch("explorer.exe", [url]);
  else launch("xdg-open", [url]);
}

export function openCodexThread(threadId: string): void {
  if (!isValidThreadId(threadId)) throw new Error("Invalid Codex thread ID");
  openCodexUrl(`codex://threads/${threadId}`);
}

export function openNewCodexTask(projectRoot?: string, prompt?: string): void {
  if (!projectRoot && !prompt) {
    openCodexUrl("codex://threads/new");
    return;
  }
  const query = new URLSearchParams();
  if (projectRoot) query.set("path", projectRoot);
  if (prompt) query.set("prompt", prompt);
  openCodexUrl(`codex://new?${query.toString()}`);
}

export async function openEditor(command: string, baseArgs: string[], projectRoot: string): Promise<void> {
  if (!command.trim() || command.includes("\0") || projectRoot.includes("\0")) throw new Error("Invalid editor launch settings");
  if (!(await stat(projectRoot)).isDirectory()) throw new Error("Project directory does not exist");
  launch(command, [...baseArgs, projectRoot]);
}

export async function openDirectory(directory: string): Promise<void> {
  if (!(await stat(directory)).isDirectory()) throw new Error("Directory does not exist");
  if (process.platform === "darwin") launch("/usr/bin/open", [directory]);
  else if (process.platform === "win32") launch("explorer.exe", [directory]);
  else launch("xdg-open", [directory]);
}
