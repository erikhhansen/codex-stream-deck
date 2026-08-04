import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const roots = [
  resolve("com.codexstreamdeck.control.sdPlugin/imgs"),
  resolve("codex-agent-keys/com.codexstreamdeck.agentkeys.sdPlugin/imgs")
];

const { readdir } = await import("node:fs/promises");

for (const root of roots) {
  for (const name of await readdir(root)) {
    if (!name.endsWith(".svg")) continue;
    const path = resolve(root, name);
    const source = await readFile(path, "utf8");
    if (source.includes('data-codex-black-backing="true"')) continue;
    const viewBox = source.match(/viewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/);
    if (!viewBox) throw new Error(`No viewBox found in ${path}`);
    const backing = `<rect data-codex-black-backing="true" width="${viewBox[1]}" height="${viewBox[2]}" fill="#000000"/>`;
    const updated = source.replace(/(<svg\b[^>]*>)/, `$1${backing}`);
    await writeFile(path, updated);
  }
}
