import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { HOSTS, manifestForHost } from "./host-manifest.mjs";

const [host, outputPath] = process.argv.slice(2);
if (!host || !outputPath || !HOSTS.includes(host)) {
  throw new Error("Usage: node scripts/prepare-host-package.mjs <streamdeck|streamdock> <output-plugin-directory>");
}

const sourceDirectory = resolve("com.codexstreamdeck.agentkeys.sdPlugin");
const destinationDirectory = resolve(outputPath);
const sourceManifest = JSON.parse(await readFile(resolve(sourceDirectory, "manifest.json"), "utf8"));

await rm(destinationDirectory, { recursive: true, force: true });
await mkdir(dirname(destinationDirectory), { recursive: true });
await cp(sourceDirectory, destinationDirectory, { recursive: true });
await writeFile(
  resolve(destinationDirectory, "manifest.json"),
  `${JSON.stringify(manifestForHost(sourceManifest, host), null, 2)}\n`
);
console.log(`Prepared ${host} plugin at ${destinationDirectory}`);
