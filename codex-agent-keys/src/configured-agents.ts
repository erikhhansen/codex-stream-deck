import { readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SESSION_ACTION_UUID = "com.codexstreamdeck.agentkeys.session";

export interface ConfiguredAgent {
  threadId: string;
  name: string;
}

export function configuredAgentsFromManifest(value: unknown): ConfiguredAgent[] {
  const agents = new Map<string, ConfiguredAgent>();
  const visit = (item: unknown): void => {
    if (!item || typeof item !== "object") return;
    if (Array.isArray(item)) {
      for (const child of item) visit(child);
      return;
    }
    const record = item as Record<string, unknown>;
    if (record.UUID === SESSION_ACTION_UUID && record.Settings && typeof record.Settings === "object" && !Array.isArray(record.Settings)) {
      const settings = record.Settings as Record<string, unknown>;
      const threadId = typeof settings.threadId === "string" ? settings.threadId.trim() : "";
      const displayName = typeof settings.displayName === "string" ? settings.displayName.trim() : "";
      if (threadId) agents.set(threadId, { threadId, name: displayName || "Codex agent" });
    }
    for (const child of Object.values(record)) visit(child);
  };
  visit(value);
  return [...agents.values()];
}

async function manifestFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    await Promise.all(entries.map(async (entry) => {
      const itemPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return visit(itemPath);
      if (entry.isFile() && entry.name === "manifest.json") files.push(itemPath);
    }));
  };
  await visit(root);
  return files;
}

export async function readConfiguredAgents(): Promise<ConfiguredAgent[]> {
  const root = path.join(os.homedir(), "Library", "Application Support", "com.elgato.StreamDeck", "ProfilesV3");
  const agents = new Map<string, ConfiguredAgent>();
  for (const file of await manifestFiles(root)) {
    try {
      const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
      for (const agent of configuredAgentsFromManifest(parsed)) agents.set(agent.threadId, agent);
    } catch {
      // Ignore an incomplete profile file while Stream Deck is saving it.
    }
  }
  return [...agents.values()];
}
