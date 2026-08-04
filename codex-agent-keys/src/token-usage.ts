import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";

interface TokenPoint {
  at: number;
  cumulativeTokens: number;
  key: string;
}

// Codex's activity dashboard normalizes cached input at one eighth of an
// uncached token. Use the same weighting so this counter matches the app.
const CACHED_INPUT_WEIGHT = 1 / 8;

function tokenPoint(line: string): TokenPoint | undefined {
  try {
    const event = JSON.parse(line) as {
      timestamp?: unknown;
      payload?: {
        type?: unknown;
        info?: {
          total_token_usage?: {
            cached_input_tokens?: unknown;
            total_tokens?: unknown;
          } | null;
        } | null;
      };
    };
    if (event.payload?.type !== "token_count" || typeof event.timestamp !== "string") return undefined;
    const at = Date.parse(event.timestamp);
    const usage = event.payload.info?.total_token_usage;
    const totalTokens = usage?.total_tokens;
    const cachedInputTokens = usage?.cached_input_tokens ?? 0;
    if (!Number.isFinite(at)
      || typeof totalTokens !== "number"
      || !Number.isFinite(totalTokens)
      || totalTokens < 0
      || typeof cachedInputTokens !== "number"
      || !Number.isFinite(cachedInputTokens)
      || cachedInputTokens < 0) return undefined;
    const cumulativeTokens = totalTokens - cachedInputTokens * (1 - CACHED_INPUT_WEIGHT);
    const key = `${event.timestamp}|${totalTokens}|${cachedInputTokens}`;
    return { at, cumulativeTokens, key };
  } catch {
    return undefined;
  }
}

function accumulate(seen: Set<string>, point: TokenPoint, delta: number, start: number, end: number): number {
  if (point.at < start || point.at >= end || seen.has(point.key)) return 0;
  seen.add(point.key);
  return delta;
}

export function tokensFromJsonl(text: string, start: number, end: number): number {
  const seen = new Set<string>();
  let total = 0;
  let previous: number | undefined;
  for (const line of text.split(/\r?\n/)) {
    const point = tokenPoint(line);
    if (!point) continue;
    const delta = previous === undefined || point.cumulativeTokens < previous
      ? point.cumulativeTokens
      : point.cumulativeTokens - previous;
    previous = point.cumulativeTokens;
    total += accumulate(seen, point, delta, start, end);
  }
  return Math.round(total);
}

async function candidateFiles(root: string, start: number): Promise<string[]> {
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    await Promise.all(entries.map(async (entry) => {
      const itemPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return visit(itemPath);
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) return;
      const info = await stat(itemPath).catch(() => undefined);
      if (info?.isFile() && info.mtimeMs >= start) files.push(itemPath);
    }));
  };
  await visit(root);
  return files;
}

async function tokensFromFile(filePath: string, start: number, end: number, seen: Set<string>): Promise<number> {
  let total = 0;
  let previous: number | undefined;
  const lines = createInterface({ input: createReadStream(filePath, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of lines) {
    const point = tokenPoint(line);
    if (!point) continue;
    const delta = previous === undefined || point.cumulativeTokens < previous
      ? point.cumulativeTokens
      : point.cumulativeTokens - previous;
    previous = point.cumulativeTokens;
    total += accumulate(seen, point, delta, start, end);
  }
  return total;
}

export function localDayBounds(now = new Date()): { start: number; end: number } {
  const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { start: startDate.getTime(), end: endDate.getTime() };
}

export async function readTokensToday(now = new Date()): Promise<number> {
  const { start, end } = localDayBounds(now);
  const codexRoot = path.join(os.homedir(), ".codex");
  const roots = [path.join(codexRoot, "sessions"), path.join(codexRoot, "archived_sessions")];
  const files = (await Promise.all(roots.map((root) => candidateFiles(root, start)))).flat();
  const seen = new Set<string>();
  let total = 0;
  for (const filePath of files) total += await tokensFromFile(filePath, start, end, seen);
  return Math.round(total);
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
