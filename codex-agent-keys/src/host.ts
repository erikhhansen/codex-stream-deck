import streamDeck from "@elgato/streamdeck";

export type AgentKeysHost = "streamdeck" | "streamdock";

/**
 * Stream Dock currently reports a 3.x application version while Elgato Stream
 * Deck reports 7.x. The override keeps host-specific behavior testable and
 * gives us an escape hatch if either vendor changes its version scheme.
 */
export function agentKeysHost(): AgentKeysHost {
  const override = process.env.CODEX_AGENT_KEYS_HOST?.toLowerCase();
  if (override === "streamdeck" || override === "streamdock") return override;
  const major = Number.parseInt(streamDeck.info.application.version.split(".")[0] ?? "", 10);
  return Number.isFinite(major) && major < 7 ? "streamdock" : "streamdeck";
}

export function isStreamDock(): boolean {
  return agentKeysHost() === "streamdock";
}
