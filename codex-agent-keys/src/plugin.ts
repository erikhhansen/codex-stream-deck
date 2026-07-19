import streamDeck from "@elgato/streamdeck";

import { SessionKeyAction } from "./action.js";
import { ApproveAction, RejectAction, ReviewAction, TerminalAction, VoiceAction, VsCodeAction } from "./command-actions.js";
import { controller } from "./controller.js";
import { UsageAction } from "./usage-action.js";

streamDeck.actions.registerAction(new SessionKeyAction());
streamDeck.actions.registerAction(new ApproveAction());
streamDeck.actions.registerAction(new RejectAction());
streamDeck.actions.registerAction(new TerminalAction());
streamDeck.actions.registerAction(new ReviewAction());
streamDeck.actions.registerAction(new VoiceAction());
streamDeck.actions.registerAction(new VsCodeAction());
streamDeck.actions.registerAction(new UsageAction());
await streamDeck.connect();
await controller.start();
