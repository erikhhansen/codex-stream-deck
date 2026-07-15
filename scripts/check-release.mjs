import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const ignoredDirectories = new Set([".git", "node_modules", "bin", "coverage", ".test-logs"]);
const ignoredExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".ico", ".streamDeckPlugin"]);
const findings = [];
const checks = [
  ["absolute Windows user path", /[A-Za-z]:\\Users\\[^\\/\r\n]+/g],
  ["absolute macOS user path", /\/Users\/[^/\r\n]+/g],
  ["private key", /BEGIN (?:RSA|OPENSSH|EC|DSA) PRIVATE KEY/g],
  ["OpenAI-style secret", /\bsk-[A-Za-z0-9_-]{20,}/g],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{20,}/g],
  ["bearer credential", /\bBearer\s+[A-Za-z0-9._~+/-]{20,}={0,2}/gi]
];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(file);
      continue;
    }
    if (!entry.isFile() || ignoredExtensions.has(path.extname(entry.name))) continue;
    let contents;
    try {
      contents = await readFile(file, "utf8");
    } catch {
      continue;
    }
    for (const [label, pattern] of checks) {
      pattern.lastIndex = 0;
      if (pattern.test(contents)) findings.push(`${path.relative(root, file)}: ${label}`);
    }
  }
}

await walk(root);
if (findings.length) {
  console.error(["Release privacy check failed:", ...findings.map((item) => `- ${item}`)].join("\n"));
  process.exitCode = 1;
} else {
  console.log("Release privacy check passed: no local user paths, private keys, or token-shaped secrets found.");
}
