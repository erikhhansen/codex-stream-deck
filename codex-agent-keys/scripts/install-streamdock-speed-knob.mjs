import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, join } from "node:path";

const profilePath = process.argv[2];
const backupRoot = process.argv[3];
if (!profilePath || !backupRoot) {
  throw new Error("Usage: node install-streamdock-speed-knob.mjs <profile-manifest> <backup-directory>");
}

const manifest = JSON.parse(await readFile(profilePath, "utf8"));
if (manifest.Name !== "Codex" || manifest.DeviceModel !== "20GBA9901") {
  throw new Error(`Refusing to edit unexpected Stream Dock profile: ${manifest.Name ?? "unnamed"}`);
}

const coordinate = "1,0";
const existing = manifest.Actions?.[coordinate];
if (existing && existing.UUID !== "com.codexstreamdeck.agentkeys.speed") {
  throw new Error(`Refusing to replace ${existing.Name ?? existing.UUID} at knob ${coordinate}`);
}

await mkdir(backupRoot, { recursive: true });
await copyFile(profilePath, join(backupRoot, basename(profilePath)));
manifest.Actions ??= {};
manifest.Actions[coordinate] = {
  ActionID: existing?.ActionID ?? randomUUID(),
  Controller: "Knob",
  Name: "Speed",
  Settings: {},
  State: 0,
  States: [{ Image: "imgs/speed", ShowTitle: false }],
  UUID: "com.codexstreamdeck.agentkeys.speed"
};
await writeFile(profilePath, `${JSON.stringify(manifest, null, 4)}\n`);

console.log(`Installed Speed at knob ${coordinate} in ${manifest.Name}`);
console.log(`Backup: ${join(backupRoot, basename(profilePath))}`);
