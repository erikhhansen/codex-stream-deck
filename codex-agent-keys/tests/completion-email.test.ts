import { describe, expect, it } from "vitest";

import { COMPLETION_EMAIL_SUBJECT, completionEmailBody, DEFAULT_EMAIL_SENDER, sendGridPayload } from "../src/completion-email.js";

describe("completion email", () => {
  it("uses the authenticated Codex sender", () => {
    expect(DEFAULT_EMAIL_SENDER).toBe("codex@haldanconsulting.com");
  });

  it("adds useful Codex session stats", () => {
    expect(completionEmailBody("Stream Deck", {
      project: "stream-deck",
      model: "gpt-5.6-sol",
      effort: "HIGH",
      speed: "Fast",
      usageRemaining: 62,
      completedAt: "Jul 19, 2026, 8:30 PM"
    })).toBe([
      "Stream Deck has finished and is idle.",
      "",
      "Project: stream-deck",
      "Model: gpt-5.6-sol",
      "Effort: HIGH",
      "Speed: Fast",
      "Codex usage remaining: 62%",
      "Completed: Jul 19, 2026, 8:30 PM"
    ].join("\n"));
  });

  it("builds a SendGrid sandbox request without changing the production template", () => {
    const payload = sendGridPayload("sender@example.com", "recipient@example.com", "Stream Deck", {}, true);
    expect(payload.subject).toBe(COMPLETION_EMAIL_SUBJECT);
    expect(payload.personalizations).toEqual([{ to: [{ email: "recipient@example.com" }] }]);
    expect(payload.mail_settings).toEqual({ sandbox_mode: { enable: true } });
  });
});
