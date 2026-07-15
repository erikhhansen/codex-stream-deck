import path from "node:path";

import { describe, expect, it } from "vitest";

import { CodexAppServer } from "../../src/codex-app-server.js";
import { DiagnosticLogger } from "../../src/logger.js";

const run = process.env.CODEX_INTEGRATION === "1" ? describe : describe.skip;

run("Codex app-server integration", () => {
  it("initializes and lists local threads using the pinned Codex CLI", async () => {
    const logger = new DiagnosticLogger(path.join(process.cwd(), ".test-logs"), () => false);
    const client = new CodexAppServer(logger);
    const codexEntry = path.resolve("node_modules", "@openai", "codex", "bin", "codex.js");
    try {
      const initialization = await client.start(codexEntry);
      expect(initialization).toBeTypeOf("object");
      const threads = await client.listThreads(["cli", "vscode", "appServer"]);
      expect(Array.isArray(threads.data)).toBe(true);
    } finally {
      await client.stop();
    }
  });
});
