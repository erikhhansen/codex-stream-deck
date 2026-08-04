import streamDeck from "@elgato/streamdeck";

import { SessionKeyAction } from "./action.js";
import { ApproveAction, CaptureAction, CommitMergeDeployAction, DoItAction, GuideMeAction, RejectAction, ReviewAction, TerminalAction, VoiceAction, VsCodeAction } from "./command-actions.js";
import { controller } from "./controller.js";
import { UsageAction } from "./usage-action.js";
import { TokensTodayAction } from "./token-usage-action.js";
import { SpeedAction } from "./speed-action.js";
import { ModelAction } from "./model-action.js";
import { EffortAction } from "./effort-action.js";
import { MergeGateAction } from "./merge-gate-action.js";
import { isStreamDock } from "./host-image.js";

streamDeck.actions.registerAction(new SessionKeyAction());
streamDeck.actions.registerAction(new ApproveAction());
streamDeck.actions.registerAction(new RejectAction());
streamDeck.actions.registerAction(new TerminalAction());
streamDeck.actions.registerAction(new ReviewAction());
streamDeck.actions.registerAction(new VoiceAction());
streamDeck.actions.registerAction(new CaptureAction());
streamDeck.actions.registerAction(new DoItAction());
streamDeck.actions.registerAction(new GuideMeAction());
streamDeck.actions.registerAction(new CommitMergeDeployAction());
streamDeck.actions.registerAction(new VsCodeAction());
streamDeck.actions.registerAction(new UsageAction());
streamDeck.actions.registerAction(new TokensTodayAction());
streamDeck.actions.registerAction(new SpeedAction());
streamDeck.actions.registerAction(new ModelAction());
streamDeck.actions.registerAction(new EffortAction());
streamDeck.actions.registerAction(new MergeGateAction());
await streamDeck.connect();

// Stream Dock does not terminate plugin helpers when its host process exits.
// The controller's timers and Codex child process otherwise keep Node alive,
// causing stale plugin instances to accumulate across app restarts.
if (isStreamDock()) {
  const hostParentPid = process.ppid;
  const parentWatchdog = setInterval(() => {
    if (process.ppid === hostParentPid && process.ppid !== 1) return;
    clearInterval(parentWatchdog);
    void controller.stop().finally(() => process.exit(0));
  }, 1_000);
  parentWatchdog.unref();
}

await controller.start();
