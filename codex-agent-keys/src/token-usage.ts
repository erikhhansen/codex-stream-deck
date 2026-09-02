import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

interface TokenUsageOptions {
  authPath?: string;
  fetchImpl?: typeof fetch;
}

const PROFILE_URL = "https://chatgpt.com/backend-api/wham/profiles/me";

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function localDateIso(now = new Date()): string {
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function profileTokensForDate(value: unknown, dateIso: string): number | undefined {
  const buckets = record(record(value)?.stats)?.daily_usage_buckets;
  if (!Array.isArray(buckets)) return undefined;
  let total = 0;
  for (const item of buckets) {
    const bucket = record(item);
    if (bucket?.start_date !== dateIso) continue;
    const tokens = bucket.tokens;
    if (typeof tokens !== "number" || !Number.isFinite(tokens)) return undefined;
    total += Math.max(0, tokens);
  }
  return Math.round(total);
}

export async function readTokensToday(now = new Date(), options: TokenUsageOptions = {}): Promise<number> {
  const authPath = options.authPath ?? path.join(os.homedir(), ".codex", "auth.json");
  const auth = record(JSON.parse(await readFile(authPath, "utf8")));
  const tokens = record(auth?.tokens);
  const accessToken = tokens?.access_token;
  const accountId = tokens?.account_id;
  if (typeof accessToken !== "string" || !accessToken || typeof accountId !== "string" || !accountId) {
    throw new Error("Codex ChatGPT authentication is unavailable");
  }
  const response = await (options.fetchImpl ?? fetch)(PROFILE_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "ChatGPT-Account-Id": accountId
    },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Codex profile usage request failed with status ${response.status}`);
  const total = profileTokensForDate(await response.json(), localDateIso(now));
  if (total === undefined) throw new Error("Codex profile usage response was invalid");
  return total;
}

export function compactTokens(total: number): string {
  const safe = Math.max(0, Math.round(total));
  const format = (value: number, suffix: string): string => `${value.toFixed(value >= 100 ? 0 : 1).replace(/\.0$/, "")}${suffix}`;
  if (safe < 1_000) return String(safe);
  if (safe < 1_000_000) return format(safe / 1_000, "K");
  if (safe < 1_000_000_000) return format(safe / 1_000_000, "M");
  return format(safe / 1_000_000_000, "B");
}

export function renderTokensKey(total: number | undefined, compactWidth?: number): string {
  const value = total === undefined ? "—" : compactTokens(total);
  const fontSize = value.length >= 5 ? 45 : 56;
  if (compactWidth) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${compactWidth} 72">
  <rect width="${compactWidth}" height="72" fill="#000000"/>
  <rect width="${compactWidth}" height="72" rx="12" fill="#8BB7FF"/>
  <rect x="2" y="2" width="${compactWidth - 4}" height="68" rx="10" fill="none" stroke="#17202B" stroke-opacity=".25" stroke-width="2"/>
  <text x="${compactWidth / 2}" y="45" text-anchor="middle" font-family="Arial, sans-serif" font-size="${value.length >= 5 ? 27 : 32}" font-weight="900" fill="#17202B">${value}</text>
</svg>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" fill="#000000"/>
  <rect width="144" height="144" rx="20" fill="#8BB7FF"/>
  <rect x="4" y="4" width="136" height="136" rx="17" fill="none" stroke="#17202B" stroke-opacity=".25" stroke-width="2"/>
  <text x="72" y="90" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="900" fill="#17202B">${value}</text>
</svg>`;
}
