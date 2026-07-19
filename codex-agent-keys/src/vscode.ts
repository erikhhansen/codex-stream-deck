import { execFile } from "node:child_process";
import { access, stat } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const VSCODE_CLI = "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code";

export async function resolveRepositoryRoot(cwd: string): Promise<string> {
  const candidate = cwd.trim();
  if (!candidate || candidate.includes("\0")) throw new Error("The selected task has no project folder");
  if (!(await stat(candidate).catch(() => undefined))?.isDirectory()) {
    throw new Error("The selected task's project folder is unavailable");
  }
  try {
    const { stdout } = await execFileAsync("/usr/bin/git", ["-C", candidate, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      timeout: 5_000
    });
    const root = stdout.trim();
    return root && !root.includes("\0") ? root : candidate;
  } catch {
    return candidate;
  }
}

export async function openProjectInVsCode(cwd: string): Promise<string> {
  if (process.platform !== "darwin") throw new Error("VS Code project opening currently requires macOS");
  const root = await resolveRepositoryRoot(cwd);
  await access(VSCODE_CLI);
  await execFileAsync(VSCODE_CLI, [root], { timeout: 15_000 });
  return root;
}
