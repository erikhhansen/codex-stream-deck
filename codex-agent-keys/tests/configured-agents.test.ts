import { describe, expect, it } from "vitest";

import { configuredAgentsFromManifest } from "../src/configured-agents.js";

describe("configured Agent registry", () => {
  it("finds Agent keys nested in Stream Deck folders and pages", () => {
    const manifest = {
      Controllers: {
        Keypad: {
          Pages: {
            Current: {
              Actions: {
                "0,0": {
                  UUID: "com.elgato.streamdeck.profile.openchild",
                  Actions: {
                    "0,0": {
                      UUID: "com.codexstreamdeck.agentkeys.session",
                      Settings: { threadId: "thread-1", displayName: "Stream Deck" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    };
    expect(configuredAgentsFromManifest(manifest)).toEqual([
      { threadId: "thread-1", name: "Stream Deck" }
    ]);
  });

  it("ignores unrelated actions and unassigned Agent keys", () => {
    expect(configuredAgentsFromManifest({
      a: { UUID: "com.example.other", Settings: { threadId: "wrong" } },
      b: { UUID: "com.codexstreamdeck.agentkeys.session", Settings: {} }
    })).toEqual([]);
  });
});
