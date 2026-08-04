import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, join } from "node:path";

const profilePath = process.argv[2];
const backupRoot = process.argv[3];
if (!profilePath || !backupRoot) {
  throw new Error("Usage: node install-streamdock-model-effort-knobs.mjs <profile-manifest> <backup-directory>");
}

const manifest = JSON.parse(await readFile(profilePath, "utf8"));
if (manifest.Name !== "Codex" || manifest.DeviceModel !== "20GBA9901") {
  throw new Error(`Refusing to edit unexpected Stream Dock profile: ${manifest.Name ?? "unnamed"}`);
}

const assignments = [
  { coordinate: "2,0", name: "Model", uuid: "com.codexstreamdeck.agentkeys.model", image: "imgs/model" },
  { coordinate: "3,0", name: "Effort", uuid: "com.codexstreamdeck.agentkeys.effort", image: "imgs/effort" }
];
for (const assignment of assignments) {
  const existing = manifest.Actions?.[assignment.coordinate];
  if (existing && existing.UUID !== assignment.uuid) {
    throw new Error(`Refusing to replace ${existing.Name ?? existing.UUID} at knob ${assignment.coordinate}`);
  }
}

await mkdir(backupRoot, { recursive: true });
await copyFile(profilePath, join(backupRoot, basename(profilePath)));
manifest.Actions ??= {};
for (const assignment of assignments) {
  const existing = manifest.Actions[assignment.coordinate];
  manifest.Actions[assignment.coordinate] = {
    ActionID: existing?.ActionID ?? randomUUID(),
    Controller: "Knob",
    Name: assignment.name,
    Settings: {},
    State: 0,
    States: [{ Image: assignment.image, ShowTitle: false }],
    UUID: assignment.uuid
  };
}
await writeFile(profilePath, `${JSON.stringify(manifest, null, 4)}\n`);

console.log("Installed Model at knob 2,0 and Effort at knob 3,0 in Codex");
console.log(`Backup: ${join(backupRoot, basename(profilePath))}`);
