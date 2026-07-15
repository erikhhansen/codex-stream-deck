import { describe, expect, it } from "vitest";

import { JsonlFramer } from "../src/codex-app-server.js";

describe("JSONL framing", () => {
  it("handles split and combined chunks", () => {
    const framer = new JsonlFramer();
    expect(framer.push('{"id":1')).toEqual([]);
    expect(framer.push(',"result":{}}\n{"method":"ping"}\n')).toEqual([
      '{"id":1,"result":{}}',
      '{"method":"ping"}'
    ]);
  });

  it("rejects an oversized unterminated line", () => {
    const framer = new JsonlFramer(10);
    expect(() => framer.push("12345678901")).toThrow(/size limit/);
  });
});
