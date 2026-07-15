import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFile, lstat, mkdir, open, readFile, readdir, rename, unlink, writeFile, type FileHandle } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { DiagnosticLogger } from "./logger.js";
import { codexHome } from "./paths.js";

const execFileAsync = promisify(execFile);
const MAX_EVENT_BYTES = 256 * 1024;
const MAX_MESSAGE_BYTES = 192 * 1024;
const NOTIFY_EVENT_TYPES = new Set(["agent-turn-complete", "approval-requested"]);
const EVENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

export interface NotifyEvent {
  version: 1;
  type: string;
  threadId: string;
  turnId: string;
  cwd: string;
  lastAssistantMessage?: string;
  observedAt: string;
}

export interface NotifyBridgeHealth {
  running: boolean;
  port?: number | undefined;
  accepted: number;
  rejected: number;
  spooled: number;
  lastError?: string | undefined;
}

function truncateUtf8(value: string, maxBytes: number): string {
  const encoded = Buffer.from(value, "utf8");
  if (encoded.length <= maxBytes) return value;
  return encoded.subarray(0, maxBytes).toString("utf8").replace(/\uFFFD$/, "");
}

export function parseNotifyEvent(value: unknown): NotifyEvent {
  if (!value || typeof value !== "object") throw new Error("Notify payload must be an object");
  const raw = value as Record<string, unknown>;
  const type = typeof raw.type === "string" ? raw.type.slice(0, 100) : "unknown";
  const threadId = typeof raw.threadId === "string" ? raw.threadId.slice(0, 200) : "";
  const turnId = typeof raw.turnId === "string" ? raw.turnId.slice(0, 200) : "";
  const cwd = typeof raw.cwd === "string" ? raw.cwd.slice(0, 32_768) : "";
  if (raw.version !== 1) throw new Error("Notify payload has an unsupported version");
  if (!NOTIFY_EVENT_TYPES.has(type)) throw new Error("Notify payload has an unsupported event type");
  if (!EVENT_ID_PATTERN.test(threadId) || (turnId && !EVENT_ID_PATTERN.test(turnId))) {
    throw new Error("Notify payload contains an invalid thread or turn ID");
  }
  if (!cwd || cwd.includes("\0") || !path.isAbsolute(cwd)) {
    throw new Error("Notify payload is missing a trusted absolute cwd");
  }
  const event: NotifyEvent = {
    version: 1,
    type,
    threadId,
    turnId,
    cwd,
    observedAt: typeof raw.observedAt === "string" && Number.isFinite(Date.parse(raw.observedAt)) ? raw.observedAt : new Date().toISOString()
  };
  if (typeof raw.lastAssistantMessage === "string") {
    event.lastAssistantMessage = truncateUtf8(raw.lastAssistantMessage, MAX_MESSAGE_BYTES);
  }
  return event;
}

export class NotifyBridgeServer {
  readonly #dataDirectory: string;
  readonly #logger: DiagnosticLogger;
  readonly #onEvent: (event: NotifyEvent) => Promise<void>;
  #server: http.Server | undefined;
  #lock: FileHandle | undefined;
  #health: NotifyBridgeHealth = { running: false, accepted: 0, rejected: 0, spooled: 0 };

  constructor(dataDirectory: string, logger: DiagnosticLogger, onEvent: (event: NotifyEvent) => Promise<void>) {
    this.#dataDirectory = dataDirectory;
    this.#logger = logger;
    this.#onEvent = onEvent;
  }

  get health(): NotifyBridgeHealth {
    return { ...this.#health };
  }

  async start(): Promise<void> {
    if (this.#server) return;
    await mkdir(this.#dataDirectory, { recursive: true });
    if (!this.#lock) await this.#acquireLock();
    try {
      const token = randomBytes(32).toString("base64url");
      const server = http.createServer((request, response) => this.#handleRequest(request, response, token));
      server.requestTimeout = 5_000;
      server.headersTimeout = 5_000;
      server.keepAliveTimeout = 1_000;
      server.maxHeadersCount = 32;
      this.#server = server;
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          server.off("error", reject);
          resolve();
        });
      });
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Notify bridge did not obtain a loopback port");
      const endpoint = JSON.stringify({ version: 1, host: "127.0.0.1", port: address.port, token });
      const temporary = path.join(this.#dataDirectory, `notify-endpoint.${process.pid}.tmp`);
      await writeFile(temporary, endpoint, { encoding: "utf8", mode: 0o600 });
      const endpointPath = path.join(this.#dataDirectory, "notify-endpoint.json");
      await unlink(endpointPath).catch(() => undefined);
      await rename(temporary, endpointPath);
      this.#health = { ...this.#health, running: true, port: address.port, lastError: undefined };
      await this.drainSpool();
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    const server = this.#server;
    this.#server = undefined;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await unlink(path.join(this.#dataDirectory, "notify-endpoint.json")).catch(() => undefined);
    await this.#lock?.close().catch(() => undefined);
    this.#lock = undefined;
    await unlink(path.join(this.#dataDirectory, "plugin.lock")).catch(() => undefined);
    this.#health = { ...this.#health, running: false, port: undefined };
  }

  async #acquireLock(): Promise<void> {
    const lockPath = path.join(this.#dataDirectory, "plugin.lock");
    try {
      this.#lock = await open(lockPath, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      let active = false;
      try {
        const pid = Number.parseInt(await readFile(lockPath, "utf8"), 10);
        if (Number.isInteger(pid) && pid > 0) {
          process.kill(pid, 0);
          active = true;
        }
      } catch {
        active = false;
      }
      if (active) throw new Error("Another Codex Stream Deck plugin process owns the notify bridge");
      await unlink(lockPath).catch(() => undefined);
      this.#lock = await open(lockPath, "wx", 0o600);
    }
    await this.#lock.writeFile(String(process.pid), "utf8");
    await this.#lock.sync();
  }

  async drainSpool(): Promise<void> {
    const spool = path.join(codexHome(), "streamdeck-spool");
    let names: string[];
    try {
      names = (await readdir(spool)).filter((name) => /^[A-Za-z0-9_.-]+\.json$/.test(name)).sort().slice(0, 500);
    } catch {
      return;
    }
    for (const name of names) {
      const file = path.join(spool, name);
      try {
        const info = await lstat(file);
        if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_EVENT_BYTES) continue;
        const event = parseNotifyEvent(JSON.parse(await readFile(file, "utf8")));
        await this.#onEvent(event);
        await unlink(file);
        this.#health.spooled += 1;
      } catch {
        this.#logger.warn("Ignored invalid notify spool event", { file: name.slice(0, 100) });
      }
    }
  }

  #handleRequest(request: http.IncomingMessage, response: http.ServerResponse, token: string): void {
    const contentType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
    const remote = request.socket.remoteAddress;
    if (
      request.method !== "POST" ||
      request.url !== "/event" ||
      request.headers.authorization !== `Bearer ${token}` ||
      contentType !== "application/json" ||
      (remote !== "127.0.0.1" && remote !== "::ffff:127.0.0.1")
    ) {
      this.#health.rejected += 1;
      response.writeHead(404, { "Cache-Control": "no-store", Connection: "close" }).end();
      return;
    }
    let size = 0;
    let tooLarge = false;
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= MAX_EVENT_BYTES) chunks.push(chunk);
      else tooLarge = true;
    });
    request.on("end", () => {
      void (async () => {
        try {
          if (tooLarge) {
            this.#health.rejected += 1;
            response.writeHead(413, { "Cache-Control": "no-store", Connection: "close" }).end();
            return;
          }
          const event = parseNotifyEvent(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          await this.#onEvent(event);
          this.#health.accepted += 1;
          response.writeHead(204, { "Cache-Control": "no-store", Connection: "close" }).end();
        } catch (error) {
          this.#health.rejected += 1;
          this.#health.lastError = error instanceof Error ? error.message.slice(0, 200) : "Invalid event";
          if (!response.headersSent) response.writeHead(400, { "Cache-Control": "no-store", Connection: "close" }).end();
        }
      })();
    });
    request.on("error", () => {
      this.#health.rejected += 1;
      if (!response.headersSent) response.writeHead(400, { "Cache-Control": "no-store", Connection: "close" }).end();
    });
  }
}

async function findPython(): Promise<string[]> {
  const candidates = process.platform === "win32" ? [["py", "-3"], ["python", ""]] : [["python3", ""], ["python", ""]];
  for (const [command, launcherArg] of candidates) {
    if (!command) continue;
    try {
      const args = [...(launcherArg ? [launcherArg] : []), "--version"];
      await execFileAsync(command, args, { timeout: 5_000, windowsHide: true });
      return launcherArg ? [command, launcherArg] : [command];
    } catch {
      // Try the next launcher.
    }
  }
  throw new Error("Python 3 is required for the Codex notify helper");
}

function parseTomlCommand(value: string): string[] | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string") ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export interface NotifyInstallResult {
  installed: boolean;
  chained: boolean;
  configPath: string;
  backupPath?: string;
  message: string;
}

export async function installNotifyBridge(pluginRoot: string, dataDirectory: string): Promise<NotifyInstallResult> {
  const launcher = await findPython();
  const helperSource = path.join(pluginRoot, "helpers", "codex_streamdeck_notify.py");
  const chainSource = path.join(pluginRoot, "helpers", "codex_streamdeck_notify_chain.py");
  const helperTarget = path.join(dataDirectory, "codex_streamdeck_notify.py");
  const chainTarget = path.join(dataDirectory, "codex_streamdeck_notify_chain.py");
  await mkdir(dataDirectory, { recursive: true });
  await copyFile(helperSource, helperTarget);
  await copyFile(chainSource, chainTarget);

  const configPath = path.join(codexHome(), "config.toml");
  await mkdir(path.dirname(configPath), { recursive: true });
  const original = await readFile(configPath, "utf8").catch(() => "");
  const existingMatch = original.match(/^\s*notify\s*=\s*(\[[^\r\n]*\])\s*$/m);
  const directCommand = [...launcher, helperTarget];
  if (existingMatch && existingMatch[1]) {
    const existing = parseTomlCommand(existingMatch[1]);
    if (existing && JSON.stringify(existing) === JSON.stringify(directCommand)) {
      return { installed: true, chained: false, configPath, message: "Notify bridge is already installed." };
    }
    if (!existing) {
      return {
        installed: false,
        chained: false,
        configPath,
        message: "An existing notify command uses unsupported TOML syntax; it was left unchanged."
      };
    }
    const chainConfig = path.join(dataDirectory, "notify-chain.json");
    await writeFile(chainConfig, JSON.stringify({ commands: [existing, directCommand] }), { encoding: "utf8", mode: 0o600 });
    const replacement = `notify = ${JSON.stringify([...launcher, chainTarget, chainConfig])}`;
    return writeCodexConfig(configPath, original.replace(existingMatch[0], replacement), true);
  }

  const notifyLine = `notify = ${JSON.stringify(directCommand)}`;
  const firstTable = original.search(/^\s*\[/m);
  const updated = firstTable >= 0
    ? `${original.slice(0, firstTable).replace(/\s*$/, "")}\n${notifyLine}\n\n${original.slice(firstTable)}`
    : `${notifyLine}\n${original ? `\n${original}` : ""}`;
  return writeCodexConfig(configPath, updated, false);
}

async function writeCodexConfig(configPath: string, contents: string, chained: boolean): Promise<NotifyInstallResult> {
  const backupPath = `${configPath}.streamdeck-backup-${Date.now()}`;
  const original = await readFile(configPath).catch(() => undefined);
  if (original) await writeFile(backupPath, original, { mode: 0o600 });
  const temporary = `${configPath}.${process.pid}.tmp`;
  await writeFile(temporary, contents, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, configPath);
  return {
    installed: true,
    chained,
    configPath,
    ...(original ? { backupPath } : {}),
    message: chained ? "Notify bridge installed and chained after the existing notifier." : "Notify bridge installed. Restart Codex clients to activate it."
  };
}
