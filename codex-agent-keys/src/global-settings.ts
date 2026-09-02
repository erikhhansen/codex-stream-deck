import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import streamDeck from "@elgato/streamdeck";

import { isStreamDock } from "./host.js";
import type { GlobalSettings } from "./types.js";

const streamDockSettingsPath = join(
  homedir(),
  "Library",
  "Application Support",
  "HotSpot",
  "StreamDock",
  "codex-agent-keys-settings.json"
);

let cached: GlobalSettings = {};
let loaded = false;

export function rememberGlobalSettings(settings: GlobalSettings): GlobalSettings {
  const streamDock = isStreamDock();
  const accepted: GlobalSettings = { ...settings };
  if (streamDock) {
    if (cached.activeThreadId === undefined) delete accepted.activeThreadId;
    else accepted.activeThreadId = cached.activeThreadId;
  }
  cached = accepted;
  loaded = true;
  if (streamDock) void persistStreamDockSettings(cached);
  return { ...accepted };
}

export async function getGlobalSettings(): Promise<GlobalSettings> {
  if (!isStreamDock()) return streamDeck.settings.getGlobalSettings<GlobalSettings>();
  if (!loaded) {
    try {
      cached = JSON.parse(await readFile(streamDockSettingsPath, "utf8")) as GlobalSettings;
    } catch {
      cached = {};
    }
    loaded = true;
  }
  return { ...cached };
}

export async function setGlobalSettings(settings: GlobalSettings): Promise<void> {
  cached = { ...settings };
  loaded = true;
  if (!isStreamDock()) {
    await streamDeck.settings.setGlobalSettings(settings);
    return;
  }
  await persistStreamDockSettings(settings);
  // Stream Dock accepts this notification even though its corresponding read
  // request never receives a response.
  void streamDeck.settings.setGlobalSettings(settings).catch(() => undefined);
}

async function persistStreamDockSettings(settings: GlobalSettings): Promise<void> {
  try {
    await mkdir(dirname(streamDockSettingsPath), { recursive: true });
    await writeFile(streamDockSettingsPath, JSON.stringify(settings, null, 2));
  } catch (error) {
    streamDeck.logger.warn(`Could not save Stream Dock settings: ${error instanceof Error ? error.message : String(error)}`);
  }
}
