import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { HOSTS, manifestForHost } from "./host-manifest.mjs";

const [host, outputPath] = process.argv.slice(2);
if (!host || !outputPath || !HOSTS.includes(host)) {
  throw new Error("Usage: node scripts/generate-host-manifest.mjs <streamdeck|streamdock> <output-path>");
}

const sourcePath = resolve("com.codexstreamdeck.agentkeys.sdPlugin/manifest.json");
const source = JSON.parse(await readFile(sourcePath, "utf8"));
const manifest = manifestForHost(source, host);
await writeFile(resolve(outputPath), `${JSON.stringify(manifest, null, 2)}\n`);
