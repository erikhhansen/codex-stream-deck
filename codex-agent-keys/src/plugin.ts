import streamDeck from "@elgato/streamdeck";

import { SessionKeyAction } from "./action.js";
import { ApproveAction, RejectAction, ReviewAction, TerminalAction, VoiceAction, VsCodeAction } from "./command-actions.js";
import { controller } from "./controller.js";
import { UsageAction } from "./usage-action.js";
import { TokensTodayAction } from "./token-usage-action.js";
import { SpeedAction } from "./speed-action.js";
import { ModelAction } from "./model-action.js";
import { EffortAction } from "./effort-action.js";
import { MergeGateAction } from "./merge-gate-action.js";

streamDeck.actions.registerAction(new SessionKeyAction());
streamDeck.actions.registerAction(new ApproveAction());
streamDeck.actions.registerAction(new RejectAction());
streamDeck.actions.registerAction(new TerminalAction());
streamDeck.actions.registerAction(new ReviewAction());
streamDeck.actions.registerAction(new VoiceAction());
streamDeck.actions.registerAction(new VsCodeAction());
streamDeck.actions.registerAction(new UsageAction());
streamDeck.actions.registerAction(new TokensTodayAction());
streamDeck.actions.registerAction(new SpeedAction());
streamDeck.actions.registerAction(new ModelAction());
streamDeck.actions.registerAction(new EffortAction());
streamDeck.actions.registerAction(new MergeGateAction());
await streamDeck.connect();
await controller.start();
