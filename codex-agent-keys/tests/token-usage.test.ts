import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { compactTokens, localDateIso, profileTokensForDate, readTokensToday, renderTokensKey } from "../src/token-usage.js";

describe("today's Codex token usage", () => {
  it("uses the same daily usage bucket reported by Codex Desktop", () => {
    expect(profileTokensForDate({
      stats: {
        daily_usage_buckets: [
          { start_date: "2026-08-03", tokens: 10 },
          { start_date: "2026-08-04", tokens: 277_335_078 }
        ]
      }
    }, "2026-08-04")).toBe(277_335_078);
  });

  it("sums duplicate buckets and clamps negative corrections like Codex Desktop", () => {
    expect(profileTokensForDate({
      stats: {
        daily_usage_buckets: [
          { start_date: "2026-08-04", tokens: 200 },
          { start_date: "2026-08-04", tokens: -50 },
          { start_date: "2026-08-04", tokens: 75 }
        ]
      }
    }, "2026-08-04")).toBe(275);
  });

  it("returns zero when the profile has no bucket for today", () => {
    expect(profileTokensForDate({ stats: { daily_usage_buckets: [] } }, "2026-08-04")).toBe(0);
  });

  it("uses the local calendar date expected by the Daily chart", () => {
    expect(localDateIso(new Date(2026, 7, 4, 23, 59))).toBe("2026-08-04");
  });

  it("authenticates and reads the exact profile bucket", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "codex-token-usage-"));
    const authPath = path.join(directory, "auth.json");
    await writeFile(authPath, JSON.stringify({
      tokens: { access_token: "test-access-token", account_id: "test-account" }
    }));
    try {
      const total = await readTokensToday(new Date(2026, 7, 4, 12), {
        authPath,
        fetchImpl: async (input, init) => {
          expect(String(input)).toBe("https://chatgpt.com/backend-api/wham/profiles/me");
          const headers = new Headers(init?.headers);
          expect(headers.get("Authorization")).toBe("Bearer test-access-token");
          expect(headers.get("ChatGPT-Account-Id")).toBe("test-account");
          return new Response(JSON.stringify({
            stats: { daily_usage_buckets: [{ start_date: "2026-08-04", tokens: 277_335_078 }] }
          }));
        }
      });
      expect(total).toBe(277_335_078);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("formats Stream Deck-sized values", () => {
    expect(compactTokens(999)).toBe("999");
    expect(compactTokens(23_400)).toBe("23.4K");
    expect(compactTokens(23_400_000)).toBe("23.4M");
    expect(compactTokens(1_250_000_000)).toBe("1.3B");
    expect(renderTokensKey(23_400_000)).toContain("23.4M");
  });
});

const local = process.env.RUN_CODEX_INTEGRATION === "1" ? describe : describe.skip;

local("Codex profile usage", () => {
  it("returns today's reported token total", async () => {
    expect(await readTokensToday()).toBeGreaterThanOrEqual(0);
  }, 30_000);
});
