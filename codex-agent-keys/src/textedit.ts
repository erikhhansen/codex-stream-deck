import { spawn } from "node:child_process";

export interface TextEditLaunchSpec {
  command: string;
  args: string[];
}

export function textEditPlainTextLaunch(platform: NodeJS.Platform = process.platform): TextEditLaunchSpec {
  if (platform !== "darwin") throw new Error("TextEdit is only available on macOS");
  return {
    command: "/usr/bin/open",
    // `open -f` turns stdin into a text file. With stdin closed, TextEdit
    // receives a new blank .txt document regardless of its rich-text default.
    args: ["-b", "com.apple.TextEdit", "-f"]
  };
}

export async function openTextEditPlainText(): Promise<void> {
  const { command, args } = textEditPlainTextLaunch();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString("utf8")}`.slice(-1_000);
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `Could not open TextEdit (status ${code ?? "unknown"})`));
    });
  });
}
