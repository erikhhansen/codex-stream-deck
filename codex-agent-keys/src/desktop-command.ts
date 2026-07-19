import { spawn } from "node:child_process";
import { chmod } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { openThread } from "./native.js";

export type DesktopCommand = "dictate" | "review" | "terminal";

export function nativeCommandPath(): string {
  return fileURLToPath(new URL("./codex-command", import.meta.url));
}

export async function runSelectedDesktopCommand(threadId: string, command: DesktopCommand): Promise<void> {
  if (process.platform !== "darwin") throw new Error("Codex desktop commands currently require macOS");
  openThread(threadId);
  await new Promise((resolve) => setTimeout(resolve, 650));
  await chmod(nativeCommandPath(), 0o755);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(nativeCommandPath(), [command], { shell: false, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString("utf8")}`.slice(-1_000);
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `Codex command exited with status ${code ?? "unknown"}`));
    });
  });
}
