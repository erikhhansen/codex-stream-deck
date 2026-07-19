import { describe, expect, it } from "vitest";

import { nativeCommandPath } from "../src/desktop-command.js";

describe("selected Codex desktop commands", () => {
  it("uses the bundled targeted-event helper", () => {
    expect(nativeCommandPath()).toMatch(/\/codex-command$/);
  });
});
