import { describe, expect, it, vi } from "vitest";

import { CodexClient } from "../src/codex-client.js";

describe("Codex thread listing", () => {
  it("requests and marks archived threads explicitly", async () => {
    const client = new CodexClient();
    const request = vi.spyOn(client, "request").mockResolvedValue({ data: [{ id: "old" }] });

    expect(await client.listThreads(true)).toEqual([{ id: "old", archived: true }]);
    expect(request).toHaveBeenCalledWith("thread/list", expect.objectContaining({ archived: true }), 30_000);
  });
});
