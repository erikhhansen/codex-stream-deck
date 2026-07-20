import { execFile } from "node:child_process";
import { promisify } from "node:util";

import streamDeck from "@elgato/streamdeck";

import type { CompletionEmailStats, GlobalSettings } from "./types.js";

const execFileAsync = promisify(execFile);
const KEYCHAIN_SERVICE = "com.codexstreamdeck.agentkeys.sendgrid";
const KEYCHAIN_ACCOUNT = "sendgrid-api-key";

export const DEFAULT_EMAIL_SENDER = "codex@haldanconsulting.com";
export const DEFAULT_EMAIL_RECIPIENT = "ehansen@haldanconsulting.com";
export const COMPLETION_EMAIL_SUBJECT = "Codex — agents finished";

export function completionEmailBody(name: string, stats: CompletionEmailStats = {}): string {
  const cleanName = name.trim() || "A Codex agent";
  const lines = [`${cleanName} has finished and is idle.`];
  const details: Array<[string, string | number | undefined]> = [
    ["Project", stats.project],
    ["Model", stats.model],
    ["Effort", stats.effort],
    ["Speed", stats.speed],
    ["Codex usage remaining", stats.usageRemaining === undefined ? undefined : `${stats.usageRemaining}%`],
    ["Completed", stats.completedAt]
  ];
  const available = details.filter((item): item is [string, string | number] => item[1] !== undefined && item[1] !== "");
  if (available.length > 0) lines.push("", ...available.map(([label, value]) => `${label}: ${value}`));
  return lines.join("\n");
}

export function sendGridPayload(sender: string, recipient: string, name: string, stats: CompletionEmailStats = {}, sandbox = false): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    personalizations: [{ to: [{ email: recipient }] }],
    from: { email: sender },
    subject: COMPLETION_EMAIL_SUBJECT,
    content: [{ type: "text/plain", value: completionEmailBody(name, stats) }],
    categories: ["codex-agent-completion"]
  };
  if (sandbox) payload.mail_settings = { sandbox_mode: { enable: true } };
  return payload;
}

async function readApiKey(): Promise<string> {
  const { stdout } = await execFileAsync("/usr/bin/security", [
    "find-generic-password",
    "-s",
    KEYCHAIN_SERVICE,
    "-a",
    KEYCHAIN_ACCOUNT,
    "-w"
  ], { encoding: "utf8" });
  const key = stdout.trim();
  if (!key.startsWith("SG.")) throw new Error("The SendGrid key in Keychain is invalid");
  return key;
}

async function postEmail(settings: GlobalSettings, name: string, stats: CompletionEmailStats, sandbox: boolean): Promise<number> {
  const sender = settings.completionEmailSender?.trim() || DEFAULT_EMAIL_SENDER;
  const recipient = settings.completionEmailRecipient?.trim() || DEFAULT_EMAIL_RECIPIENT;
  const apiKey = await readApiKey();
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(sendGridPayload(sender, recipient, name, stats, sandbox))
  });
  const expected = sandbox ? 200 : 202;
  if (response.status !== expected) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`SendGrid returned ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  streamDeck.logger.info(`Completion email ${sandbox ? "validated" : "queued"}: recipient=${recipient}, subject=${COMPLETION_EMAIL_SUBJECT}, status=${response.status}`);
  return response.status;
}

export class CompletionEmailNotifier {
  readonly #recent = new Map<string, number>();

  enqueue(threadId: string, name: string, stats: () => Promise<CompletionEmailStats>): void {
    if (!threadId) return;
    const now = Date.now();
    if (now - (this.#recent.get(threadId) ?? 0) < 60_000) return;
    this.#recent.set(threadId, now);
    void this.#send(name.trim() || "Codex agent", stats);
  }

  async validate(): Promise<number> {
    const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
    return postEmail(settings, "Example agent", {
      project: "example-project",
      model: "gpt-5.6-sol",
      effort: "HIGH",
      speed: "Fast",
      usageRemaining: 62,
      completedAt: "Jul 19, 2026, 8:30 PM"
    }, true);
  }

  async #send(name: string, readStats: () => Promise<CompletionEmailStats>): Promise<void> {
    const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
    if (settings.completionEmailEnabled !== true) return;
    try {
      await postEmail(settings, name, await readStats(), false);
    } catch (error) {
      streamDeck.logger.error(error instanceof Error ? error.message : "Could not send completion email");
    }
  }
}

export const completionEmailNotifier = new CompletionEmailNotifier();
