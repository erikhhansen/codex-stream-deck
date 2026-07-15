import os from "node:os";
import path from "node:path";

export function dataDirectory(): string {
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "CodexStreamDeck");
  }
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "CodexStreamDeck");
  return path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"), "codex-streamdeck");
}
export function codexHome(): string {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}
