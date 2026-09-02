import { createHash } from "node:crypto";
import { mkdir, open } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CLAIM_WINDOW_MS = 60_000;
const CLAIM_DIRECTORY = join(
  homedir(),
  "Library",
  "Application Support",
  "Codex Agent Keys",
  "completion-claims"
);

/**
 * Claims one completion notification across every running host process.
 * Checking the current and previous time buckets prevents a boundary race.
 */
export async function claimCompletion(
  channel: "email" | "sound",
  threadId: string,
  now = Date.now(),
  directory = CLAIM_DIRECTORY
): Promise<boolean> {
  if (!threadId) return false;
  await mkdir(directory, { recursive: true });
  const identity = createHash("sha256").update(`${channel}:\0${threadId}`).digest("hex").slice(0, 32);
  const bucket = Math.floor(now / CLAIM_WINDOW_MS);
  const previousPath = join(directory, `${identity}-${bucket - 1}.claim`);
  try {
    const previous = await open(previousPath, "r");
    await previous.close();
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  try {
    const claim = await open(join(directory, `${identity}-${bucket}.claim`), "wx");
    await claim.close();
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}
