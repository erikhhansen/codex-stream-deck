import streamDeck from "@elgato/streamdeck";

import {
  CodexSettingsAction,
  CodexSkillsAction,
  HealthAction,
  InterruptAction,
  NewTaskAction,
  OpenEditorAction,
  ProjectSlotAction,
  RefreshAllAction,
  ReviewChangesAction
} from "./actions.js";
import { coordinator } from "./coordinator.js";

await coordinator.preload();

streamDeck.actions.registerAction(new ProjectSlotAction());
streamDeck.actions.registerAction(new RefreshAllAction());
streamDeck.actions.registerAction(new NewTaskAction());
streamDeck.actions.registerAction(new OpenEditorAction());
streamDeck.actions.registerAction(new ReviewChangesAction());
streamDeck.actions.registerAction(new InterruptAction());
streamDeck.actions.registerAction(new HealthAction());
streamDeck.actions.registerAction(new CodexSettingsAction());
streamDeck.actions.registerAction(new CodexSkillsAction());

streamDeck.system.onSystemDidWakeUp(() => void coordinator.reconnect());

await streamDeck.connect();

const streamDockMajor = Number.parseInt(streamDeck.info.application.version.split(".")[0] ?? "", 10);
if (Number.isFinite(streamDockMajor) && streamDockMajor < 7) {
  const hostParentPid = process.ppid;
  const parentWatchdog = setInterval(() => {
    if (process.ppid === hostParentPid && process.ppid !== 1) return;
    clearInterval(parentWatchdog);
    void coordinator.stop().finally(() => process.exit(0));
  }, 1_000);
  parentWatchdog.unref();
}

await coordinator.start();
