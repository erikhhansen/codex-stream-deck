import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputPath = process.argv[2];
if (!outputPath) {
  throw new Error("Usage: npm run manifest:streamdock -- <output-path>");
}

const sourcePath = resolve("com.codexstreamdeck.agentkeys.sdPlugin/manifest.json");
const manifest = JSON.parse(await readFile(sourcePath, "utf8"));

manifest.SDKVersion = 1;
manifest.CodePathMac = manifest.CodePath;
manifest.CodePathWin = manifest.CodePath;
delete manifest.CodePath;
manifest.Nodejs = { ...manifest.Nodejs, Version: "20" };
manifest.Software = { ...manifest.Software, MinimumVersion: "3.10.188.226" };
for (const action of manifest.Actions ?? []) {
  if (Array.isArray(action.Controllers)) {
    action.Controllers = action.Controllers.map((controller) => controller === "Encoder" ? "Knob" : controller);
  }
}

await writeFile(resolve(outputPath), `${JSON.stringify(manifest, null, 2)}\n`);
