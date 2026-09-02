import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const pluginDirectory = resolve("dist/streamdock/com.codexstreamdeck.agentkeys.sdPlugin");
const artifact = resolve("dist/codex-agent-keys-streamdock.streamDeckPlugin");

if (process.platform !== "darwin") {
  throw new Error("Stream Dock ZIP packaging currently requires macOS zip; the prepared plugin directory is portable.");
}
await rm(artifact, { force: true });
await execFileAsync("/usr/bin/zip", [
  "-X",
  "-q",
  "-r",
  artifact,
  "com.codexstreamdeck.agentkeys.sdPlugin"
], { cwd: resolve("dist/streamdock") });
console.log(`Packaged Stream Dock plugin at ${artifact}`);
