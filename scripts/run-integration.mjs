import { spawn } from "node:child_process";

const command = process.execPath;
const child = spawn(command, ["node_modules/vitest/vitest.mjs", "run", "tests/integration", "--testTimeout", "30000"], {
  stdio: "inherit",
  shell: false,
  env: { ...process.env, CODEX_INTEGRATION: "1" }
});
child.on("exit", (code) => process.exit(code ?? 1));
