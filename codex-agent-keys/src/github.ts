import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { resolveRepositoryRoot } from "./vscode.js";

const execFileAsync = promisify(execFile);

export function githubRepositoryUrl(remote: string): string | undefined {
  const candidate = remote.trim().replace(/(?:\.git)?\/?$/i, "");
  const scp = candidate.match(/^git@github\.com:([^/]+\/[^/]+)$/i);
  if (scp) return `https://github.com/${scp[1]}`;
  const ssh = candidate.match(/^ssh:\/\/git@github\.com\/([^/]+\/[^/]+)$/i);
  if (ssh) return `https://github.com/${ssh[1]}`;
  const https = candidate.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)$/i);
  return https ? `https://github.com/${https[1]}` : undefined;
}

export async function resolveGithubRepositoryUrl(cwd: string): Promise<string> {
  const root = await resolveRepositoryRoot(cwd);
  let remote: string;
  try {
    const result = await execFileAsync("/usr/bin/git", ["-C", root, "remote", "get-url", "origin"], {
      encoding: "utf8",
      timeout: 5_000
    });
    remote = result.stdout;
  } catch {
    throw new Error("The selected task has no origin Git remote");
  }
  const url = githubRepositoryUrl(remote);
  if (!url) throw new Error("The selected task's origin is not a GitHub repository");
  return url;
}
