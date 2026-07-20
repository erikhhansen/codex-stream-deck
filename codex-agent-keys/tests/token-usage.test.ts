import { describe, expect, it } from "vitest";

import { compactTokens, localDayBounds, readTokensToday, renderTokensKey, tokensFromJsonl } from "../src/token-usage.js";

function event(timestamp: string, cumulative: number, last = cumulative): string {
  return JSON.stringify({
    timestamp,
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        total_token_usage: { total_tokens: cumulative },
        last_token_usage: { input_tokens: last, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: last }
      }
    }
  });
}

describe("today's Codex token usage", () => {
  it("adds individual model calls instead of cumulative counters", () => {
    const start = Date.parse("2026-07-19T04:00:00.000Z");
    const end = Date.parse("2026-07-20T04:00:00.000Z");
    const text = [
      event("2026-07-19T03:30:00.000Z", 1_000, 1_000),
      event("2026-07-19T05:00:00.000Z", 1_250, 250),
      event("2026-07-19T06:00:00.000Z", 1_400, 150)
    ].join("\n");
    expect(tokensFromJsonl(text, start, end)).toBe(400);
  });

  it("counts a session that starts today from zero", () => {
    const start = Date.parse("2026-07-19T04:00:00.000Z");
    const end = Date.parse("2026-07-20T04:00:00.000Z");
    expect(tokensFromJsonl(event("2026-07-19T05:00:00.000Z", 850), start, end)).toBe(850);
  });

  it("deduplicates a copied token event", () => {
    const start = Date.parse("2026-07-19T04:00:00.000Z");
    const end = Date.parse("2026-07-20T04:00:00.000Z");
    const copied = event("2026-07-19T05:00:00.000Z", 500, 100);
    expect(tokensFromJsonl([copied, copied].join("\n"), start, end)).toBe(100);
  });

  it("uses local calendar-day boundaries", () => {
    const { start, end } = localDayBounds(new Date(2026, 6, 19, 12));
    expect(end - start).toBe(24 * 60 * 60 * 1_000);
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

local("local Codex token logs", () => {
  it("returns today's recorded token total", async () => {
    expect(await readTokensToday()).toBeGreaterThan(0);
  }, 30_000);
});
