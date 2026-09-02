import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import streamDeck from "@elgato/streamdeck";

import { claimCompletion } from "./completion-claim.js";
import { getGlobalSettings } from "./global-settings.js";

const SAMPLE_RATE = 44_100;
const DURATION_SECONDS = 0.72;
const SOUND_PATH = join(
  homedir(),
  "Library",
  "Application Support",
  "Codex Agent Keys",
  "task-complete.wav"
);

let soundReady: Promise<string> | undefined;

function envelope(time: number, start: number, duration: number): number {
  const relative = time - start;
  if (relative < 0 || relative >= duration) return 0;
  const attack = Math.min(1, relative / 0.018);
  return attack * Math.pow(1 - relative / duration, 2.4);
}

/** Creates a short, warm three-note completion chime as 16-bit mono PCM. */
export function createCompletionChime(): Buffer {
  const sampleCount = Math.floor(SAMPLE_RATE * DURATION_SECONDS);
  const dataSize = sampleCount * 2;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(SAMPLE_RATE, 24);
  wav.writeUInt32LE(SAMPLE_RATE * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataSize, 40);

  const notes = [
    { frequency: 523.25, start: 0, duration: 0.38, gain: 0.42 },
    { frequency: 659.25, start: 0.105, duration: 0.42, gain: 0.36 },
    { frequency: 783.99, start: 0.225, duration: 0.48, gain: 0.32 }
  ];
  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / SAMPLE_RATE;
    let sample = 0;
    for (const note of notes) {
      const level = envelope(time, note.start, note.duration) * note.gain;
      const phase = 2 * Math.PI * note.frequency * (time - note.start);
      sample += level * (Math.sin(phase) + 0.18 * Math.sin(phase * 2));
    }
    wav.writeInt16LE(Math.round(Math.tanh(sample * 1.25) * 0.72 * 32_767), 44 + index * 2);
  }
  return wav;
}

async function ensureSound(): Promise<string> {
  soundReady ??= (async () => {
    await mkdir(dirname(SOUND_PATH), { recursive: true });
    await writeFile(SOUND_PATH, createCompletionChime());
    return SOUND_PATH;
  })();
  return soundReady;
}

export async function playCompletionChime(): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  const soundPath = await ensureSound();
  return new Promise<boolean>((resolve) => {
    const child = spawn("/usr/bin/afplay", ["-v", "0.75", soundPath], {
      detached: true,
      stdio: "ignore"
    });
    child.once("spawn", () => {
      child.unref();
      resolve(true);
    });
    child.once("error", () => resolve(false));
  });
}

export class CompletionSoundNotifier {
  readonly #recent = new Map<string, number>();

  enqueue(threadId: string): void {
    if (!threadId) return;
    const now = Date.now();
    if (now - (this.#recent.get(threadId) ?? 0) < 60_000) return;
    this.#recent.set(threadId, now);
    void this.#play(threadId);
  }

  async test(): Promise<void> {
    if (!(await playCompletionChime())) throw new Error("The completion sound could not be played");
  }

  async #play(threadId: string): Promise<void> {
    const settings = await getGlobalSettings();
    if (settings.completionSoundEnabled === false) return;
    try {
      if (!(await claimCompletion("sound", threadId))) return;
      if (!(await playCompletionChime())) throw new Error("The completion sound could not be played");
    } catch (error) {
      streamDeck.logger.error(error instanceof Error ? error.message : "Could not play completion sound");
    }
  }
}

export const completionSoundNotifier = new CompletionSoundNotifier();
