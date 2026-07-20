import { describe, expect, it } from "vitest";

import { activityFromJsonl, didFinishWork } from "../src/session-activity.js";

const event = (timestamp: string, type: string): string => JSON.stringify({ timestamp, type: "event_msg", payload: { type } });

describe("cross-client session activity", () => {
  const now = Date.parse("2026-07-18T16:00:00.000Z");

  it("reports thinking from the latest task_started event", () => {
    expect(activityFromJsonl(event("2026-07-18T15:59:30.000Z", "task_started"), now)).toBe("thinking");
  });

  it("shows completion briefly and then changes to idle", () => {
    const line = event("2026-07-18T15:59:55.000Z", "task_complete");
    expect(activityFromJsonl(line, now)).toBe("complete");
    expect(activityFromJsonl(line, now + 20_000)).toBe("idle");
  });

  it("uses only the newest lifecycle event", () => {
    const text = [
      event("2026-07-18T15:58:00.000Z", "task_complete"),
      event("2026-07-18T15:59:30.000Z", "task_started")
    ].join("\n");
    expect(activityFromJsonl(text, now)).toBe("thinking");
  });

  it("reports failed or aborted work as an error", () => {
    expect(activityFromJsonl(event("2026-07-18T15:59:59.000Z", "turn_aborted"), now)).toBe("error");
  });

  it("infers thinking from recent agent events when task_started fell outside the file tail", () => {
    expect(activityFromJsonl(event("2026-07-18T15:59:50.000Z", "agent_reasoning"), now)).toBe("thinking");
  });

  it("does not leave old agent activity marked as thinking", () => {
    expect(activityFromJsonl(event("2026-07-18T15:00:00.000Z", "agent_message"), now)).toBe("idle");
  });

  it("notifies only on a real cross-client thinking-to-complete transition", () => {
    expect(didFinishWork("thinking", "complete")).toBe(true);
    expect(didFinishWork(undefined, "complete")).toBe(false);
    expect(didFinishWork("complete", "idle")).toBe(false);
    expect(didFinishWork("idle", "complete")).toBe(false);
  });
});
