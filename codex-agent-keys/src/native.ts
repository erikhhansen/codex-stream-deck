import { spawn } from "node:child_process";

import { requireThreadId } from "./selection.js";

export function openThread(threadId: string): void {
  const url = `codex://threads/${requireThreadId(threadId)}`;
  const child = process.platform === "darwin"
    ? spawn("/usr/bin/open", [url], { detached: true, stdio: "ignore", shell: false })
    : process.platform === "win32"
      ? spawn("explorer.exe", [url], { detached: true, stdio: "ignore", shell: false })
      : spawn("xdg-open", [url], { detached: true, stdio: "ignore", shell: false });
  child.once("error", () => undefined);
  child.unref();
}
