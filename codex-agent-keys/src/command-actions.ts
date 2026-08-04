import streamDeck, { action, type KeyDownEvent, SingletonAction } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { requestCodexCapture } from "./capture-helper.js";
import { controller } from "./controller.js";
import { runSelectedDesktopCommand, type DesktopCommand } from "./desktop-command.js";
import { openProjectInVsCode } from "./vscode.js";

async function runDesktop(event: KeyDownEvent<JsonObject>, command: DesktopCommand): Promise<void> {
  const threadId = controller.activeThreadId;
  if (!threadId) {
    await event.action.showAlert();
    return;
  }
  try {
    await runSelectedDesktopCommand(threadId, command);
    await event.action.showOk();
  } catch (error) {
    streamDeck.logger.warn(error instanceof Error ? error.message : `Could not run ${command}`);
    await event.action.showAlert();
  }
}

async function respondToApproval(event: KeyDownEvent<JsonObject>, choice: "approve" | "reject"): Promise<void> {
  const threadId = controller.activeThreadId;
  if (!threadId) {
    await event.action.showAlert();
    return;
  }
  try {
    if (!await controller.recoverApproval(threadId)) {
      await event.action.showAlert();
      return;
    }
    controller.respondToApproval(threadId, choice);
    await event.action.showOk();
  } catch (error) {
    streamDeck.logger.warn(error instanceof Error ? error.message : `Could not ${choice} request`);
    await event.action.showAlert();
  }
}

async function openVsCode(event: KeyDownEvent<JsonObject>): Promise<void> {
  const threadId = controller.activeThreadId;
  const cwd = controller.thread(threadId)?.cwd;
  if (!threadId || !cwd) {
    await event.action.showAlert();
    return;
  }
  try {
    await openProjectInVsCode(cwd);
    await event.action.showOk();
  } catch (error) {
    streamDeck.logger.warn(error instanceof Error ? error.message : "Could not open the selected project in VS Code");
    await event.action.showAlert();
  }
}

async function captureToCodex(event: KeyDownEvent<JsonObject>): Promise<void> {
  try {
    await requestCodexCapture();
    await event.action.showOk();
  } catch (error) {
    streamDeck.logger.warn(
      error instanceof Error ? error.message : "Could not start Capture to Codex"
    );
    await event.action.showAlert();
  }
}

@action({ UUID: "com.codexstreamdeck.agentkeys.approve" })
export class ApproveAction extends SingletonAction<JsonObject> {
  override async onKeyDown(event: KeyDownEvent<JsonObject>): Promise<void> {
    await respondToApproval(event, "approve");
  }
}

@action({ UUID: "com.codexstreamdeck.agentkeys.reject" })
export class RejectAction extends SingletonAction<JsonObject> {
  override async onKeyDown(event: KeyDownEvent<JsonObject>): Promise<void> {
    await respondToApproval(event, "reject");
  }
}

@action({ UUID: "com.codexstreamdeck.agentkeys.terminal" })
export class TerminalAction extends SingletonAction<JsonObject> {
  override async onKeyDown(event: KeyDownEvent<JsonObject>): Promise<void> {
    await runDesktop(event, "terminal");
  }
}

@action({ UUID: "com.codexstreamdeck.agentkeys.review" })
export class ReviewAction extends SingletonAction<JsonObject> {
  override async onKeyDown(event: KeyDownEvent<JsonObject>): Promise<void> {
    await runDesktop(event, "review");
  }
}

@action({ UUID: "com.codexstreamdeck.agentkeys.voice" })
export class VoiceAction extends SingletonAction<JsonObject> {
  override async onKeyDown(event: KeyDownEvent<JsonObject>): Promise<void> {
    await runDesktop(event, "dictate");
  }
}

@action({ UUID: "com.codexstreamdeck.agentkeys.capture" })
export class CaptureAction extends SingletonAction<JsonObject> {
  override async onKeyDown(event: KeyDownEvent<JsonObject>): Promise<void> {
    await captureToCodex(event);
  }
}

@action({ UUID: "com.codexstreamdeck.agentkeys.do-it" })
export class DoItAction extends SingletonAction<JsonObject> {
  override async onKeyDown(event: KeyDownEvent<JsonObject>): Promise<void> {
    await runDesktop(event, "do-it");
  }
}

@action({ UUID: "com.codexstreamdeck.agentkeys.guide-me" })
export class GuideMeAction extends SingletonAction<JsonObject> {
  override async onKeyDown(event: KeyDownEvent<JsonObject>): Promise<void> {
    await runDesktop(event, "guide-me");
  }
}

@action({ UUID: "com.codexstreamdeck.agentkeys.commit-merge-deploy" })
export class CommitMergeDeployAction extends SingletonAction<JsonObject> {
  override async onKeyDown(event: KeyDownEvent<JsonObject>): Promise<void> {
    await runDesktop(event, "commit-merge-deploy");
  }
}

@action({ UUID: "com.codexstreamdeck.agentkeys.vscode" })
export class VsCodeAction extends SingletonAction<JsonObject> {
  override async onKeyDown(event: KeyDownEvent<JsonObject>): Promise<void> {
    await openVsCode(event);
  }
}
