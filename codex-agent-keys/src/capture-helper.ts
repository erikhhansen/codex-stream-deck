import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

export function captureHelperPath(home = homedir()): string {
  return join(
    home,
    "Applications",
    "Capture to Codex.app",
    "Contents",
    "MacOS",
    "CaptureToCodex"
  );
}

export async function requestCodexCapture(
  executable = captureHelperPath()
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, ["--capture"], {
      shell: false,
      stdio: "ignore"
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(
          `Capture to Codex exited with ${code ?? `signal ${signal ?? "unknown"}`}`
        ));
      }
    });
  });
}
