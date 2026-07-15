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
await coordinator.start();
