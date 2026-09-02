import { spawnSync } from "node:child_process";

const outputPath = process.argv[2];
if (!outputPath) {
  throw new Error("Usage: npm run manifest:streamdock -- <output-path>");
}

const result = spawnSync(process.execPath, [
  new URL("./generate-host-manifest.mjs", import.meta.url).pathname,
  "streamdock",
  outputPath
], { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
