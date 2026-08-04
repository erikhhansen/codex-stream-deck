import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { createConnection, type Socket } from "node:net";

const INITIALIZING_CLIENT_ID = "initializing-client";
const INITIALIZE_METHOD = "initialize";
const UPDATE_THREAD_SETTINGS_METHOD = "thread-follower-update-thread-settings";
const INITIALIZE_VERSION = 0;
const UPDATE_THREAD_SETTINGS_VERSION = 1;
const DEFAULT_TIMEOUT_MS = 5_000;

/** Codex Desktop's IPC protocol rejects frames larger than 256 MiB. */
export const CODEX_DESKTOP_IPC_MAX_FRAME_BYTES = 256 * 1024 * 1024;

export function defaultCodexDesktopIpcSocketPath(): string {
  return join(homedir(), ".codex", "ipc", "ipc.sock");
}

export interface CodexDesktopThreadSettings {
  serviceTier?: string | null;
  model?: string;
  effort?: string | null;
}

export interface CodexDesktopIpcClientOptions {
  socketPath?: string;
  clientType?: string;
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
  connectionFactory?: (socketPath: string) => Socket;
  requestIdFactory?: () => string;
}

interface PendingRequest {
  method: string;
  resolve: (response: IpcSuccessResponse) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface IpcSuccessResponse {
  type: "response";
  requestId: string;
  resultType: "success";
  method: string;
  handledByClientId?: string;
  result: unknown;
}

export class CodexDesktopIpcError extends Error {
  readonly code: string;

  constructor(code: string, message = `Codex Desktop IPC request failed: ${code}`) {
    super(message);
    this.name = "CodexDesktopIpcError";
    this.code = code;
  }
}

/**
 * Client for Codex Desktop's local client-coordination router.
 *
 * The protocol is private and versioned. This implementation deliberately only
 * exposes the settings operation needed by Agent Keys so protocol changes fail
 * clearly instead of silently updating a separate app-server process.
 */
export class CodexDesktopIpcClient {
  readonly #socketPath: string;
  readonly #clientType: string;
  readonly #connectTimeoutMs: number;
  readonly #requestTimeoutMs: number;
  readonly #connectionFactory: (socketPath: string) => Socket;
  readonly #requestIdFactory: () => string;

  #socket: Socket | undefined;
  #clientId = INITIALIZING_CLIENT_ID;
  #connectPromise: Promise<void> | undefined;
  #receiveBuffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  #pending = new Map<string, PendingRequest>();
  #lastSocketError: Error | undefined;

  constructor(options: CodexDesktopIpcClientOptions = {}) {
    this.#socketPath = options.socketPath ?? defaultCodexDesktopIpcSocketPath();
    this.#clientType = nonEmptyOption(options.clientType ?? "stream-dock", "clientType");
    this.#connectTimeoutMs = positiveTimeout(options.connectTimeoutMs ?? DEFAULT_TIMEOUT_MS, "connectTimeoutMs");
    this.#requestTimeoutMs = positiveTimeout(options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS, "requestTimeoutMs");
    this.#connectionFactory = options.connectionFactory ?? ((socketPath) => createConnection({ path: socketPath }));
    this.#requestIdFactory = options.requestIdFactory ?? randomUUID;
  }

  get connected(): boolean {
    return this.#clientId !== INITIALIZING_CLIENT_ID
      && !!this.#socket
      && this.#socket.writable
      && !this.#socket.destroyed;
  }

  get clientId(): string | undefined {
    return this.connected ? this.#clientId : undefined;
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    if (this.#connectPromise) return this.#connectPromise;

    const connecting = this.#connectAndInitialize();
    this.#connectPromise = connecting;
    try {
      await connecting;
    } finally {
      if (this.#connectPromise === connecting) this.#connectPromise = undefined;
    }
  }

  async updateThreadSettings(conversationId: string, threadSettings: CodexDesktopThreadSettings): Promise<void> {
    const normalizedConversationId = nonEmptyOption(conversationId, "conversationId");
    validateThreadSettings(threadSettings);
    await this.connect();

    const response = await this.#request(
      UPDATE_THREAD_SETTINGS_METHOD,
      UPDATE_THREAD_SETTINGS_VERSION,
      { conversationId: normalizedConversationId, threadSettings },
      this.#requestTimeoutMs,
      true
    );
    if (!isRecord(response.result) || response.result.ok !== true) {
      throw new CodexDesktopIpcError(
        "invalid-response",
        "Codex Desktop returned an invalid thread settings response"
      );
    }
  }

  close(): void {
    const socket = this.#socket;
    this.#socket = undefined;
    this.#clientId = INITIALIZING_CLIENT_ID;
    this.#receiveBuffer = Buffer.alloc(0);
    this.#lastSocketError = undefined;
    this.#rejectAll(new CodexDesktopIpcError("connection-closed", "Codex Desktop IPC connection closed"));
    socket?.destroy();
  }

  async #connectAndInitialize(): Promise<void> {
    const staleSocket = this.#socket;
    if (staleSocket) {
      this.#socket = undefined;
      staleSocket.destroy();
    }

    this.#clientId = INITIALIZING_CLIENT_ID;
    this.#receiveBuffer = Buffer.alloc(0);
    this.#lastSocketError = undefined;

    let socket: Socket;
    try {
      socket = this.#connectionFactory(this.#socketPath);
    } catch (error) {
      throw connectionError(this.#socketPath, error);
    }
    this.#socket = socket;
    this.#attachSocket(socket);

    try {
      await waitForConnection(socket, this.#socketPath, this.#connectTimeoutMs);
      const response = await this.#request(
        INITIALIZE_METHOD,
        INITIALIZE_VERSION,
        { clientType: this.#clientType },
        this.#requestTimeoutMs,
        false
      );
      if (!isRecord(response.result) || typeof response.result.clientId !== "string" || !response.result.clientId) {
        throw new CodexDesktopIpcError(
          "invalid-response",
          "Codex Desktop returned an invalid initialize response"
        );
      }
      if (this.#socket !== socket || socket.destroyed) {
        throw this.#lastSocketError
          ?? new CodexDesktopIpcError("connection-closed", "Codex Desktop IPC connection closed during initialization");
      }
      this.#clientId = response.result.clientId;
    } catch (error) {
      if (this.#socket === socket) this.#socket = undefined;
      socket.destroy();
      this.#clientId = INITIALIZING_CLIENT_ID;
      this.#receiveBuffer = Buffer.alloc(0);
      throw error;
    }
  }

  #attachSocket(socket: Socket): void {
    socket.on("data", (chunk: Buffer) => {
      if (this.#socket === socket) this.#onData(chunk);
    });
    socket.on("error", (error) => {
      if (this.#socket !== socket) return;
      this.#lastSocketError = connectionError(this.#socketPath, error);
      this.#rejectAll(this.#lastSocketError);
    });
    socket.on("close", () => {
      if (this.#socket !== socket) return;
      this.#socket = undefined;
      this.#clientId = INITIALIZING_CLIENT_ID;
      this.#receiveBuffer = Buffer.alloc(0);
      const error = this.#lastSocketError
        ?? new CodexDesktopIpcError("connection-closed", "Codex Desktop IPC connection closed");
      this.#rejectAll(error);
    });
  }

  #request(
    method: string,
    version: number,
    params: Record<string, unknown>,
    localTimeoutMs: number,
    includeRouterTimeout: boolean
  ): Promise<IpcSuccessResponse> {
    const socket = this.#socket;
    if (!socket?.writable || socket.destroyed) {
      return Promise.reject(new CodexDesktopIpcError("not-connected", "Codex Desktop IPC is not connected"));
    }
    if (method !== INITIALIZE_METHOD && this.#clientId === INITIALIZING_CLIENT_ID) {
      return Promise.reject(new CodexDesktopIpcError("not-initialized", "Codex Desktop IPC is not initialized"));
    }

    const requestId = this.#requestIdFactory();
    if (!requestId || this.#pending.has(requestId)) {
      return Promise.reject(new CodexDesktopIpcError("invalid-request-id", "Codex Desktop IPC request ID was empty or duplicated"));
    }
    const request: Record<string, unknown> = {
      type: "request",
      requestId,
      sourceClientId: this.#clientId,
      version,
      method,
      params
    };
    if (includeRouterTimeout) request.timeoutMs = this.#requestTimeoutMs;

    return new Promise<IpcSuccessResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(requestId);
        reject(new CodexDesktopIpcError("timeout", `Codex Desktop IPC ${method} request timed out`));
      }, localTimeoutMs);
      this.#pending.set(requestId, { method, resolve, reject, timer });
      try {
        writeFrame(socket, request);
      } catch (error) {
        clearTimeout(timer);
        this.#pending.delete(requestId);
        reject(asError(error));
      }
    });
  }

  #onData(chunk: Buffer): void {
    this.#receiveBuffer = this.#receiveBuffer.length === 0
      ? chunk
      : Buffer.concat([this.#receiveBuffer, chunk]);

    while (this.#receiveBuffer.length >= 4) {
      const frameLength = this.#receiveBuffer.readUInt32LE(0);
      if (frameLength === 0 || frameLength > CODEX_DESKTOP_IPC_MAX_FRAME_BYTES) {
        this.#failProtocol(`Invalid Codex Desktop IPC frame length: ${frameLength}`);
        return;
      }
      if (this.#receiveBuffer.length < frameLength + 4) return;

      const payload = this.#receiveBuffer.subarray(4, frameLength + 4);
      this.#receiveBuffer = this.#receiveBuffer.subarray(frameLength + 4);
      let message: unknown;
      try {
        message = JSON.parse(payload.toString("utf8"));
      } catch {
        this.#failProtocol("Codex Desktop IPC sent invalid JSON");
        return;
      }
      this.#onMessage(message);
    }
  }

  #onMessage(message: unknown): void {
    if (!isRecord(message) || message.type !== "response" || typeof message.requestId !== "string") return;
    const pending = this.#pending.get(message.requestId);
    if (!pending) return;
    this.#pending.delete(message.requestId);
    clearTimeout(pending.timer);

    if (message.resultType === "error") {
      const code = typeof message.error === "string" && message.error ? message.error : "unknown-error";
      pending.reject(new CodexDesktopIpcError(code));
      return;
    }
    if (message.resultType !== "success" || message.method !== pending.method || !("result" in message)) {
      pending.reject(new CodexDesktopIpcError(
        "invalid-response",
        `Codex Desktop returned an invalid ${pending.method} response`
      ));
      return;
    }
    pending.resolve(message as unknown as IpcSuccessResponse);
  }

  #failProtocol(message: string): void {
    const error = new CodexDesktopIpcError("protocol-error", message);
    const socket = this.#socket;
    this.#socket = undefined;
    this.#clientId = INITIALIZING_CLIENT_ID;
    this.#receiveBuffer = Buffer.alloc(0);
    this.#rejectAll(error);
    socket?.destroy();
  }

  #rejectAll(error: Error): void {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
  }
}

function writeFrame(socket: Socket, message: Record<string, unknown>): void {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  if (payload.length === 0 || payload.length > CODEX_DESKTOP_IPC_MAX_FRAME_BYTES) {
    throw new CodexDesktopIpcError("frame-too-large", `Codex Desktop IPC frame is ${payload.length} bytes`);
  }
  const frame = Buffer.allocUnsafe(payload.length + 4);
  frame.writeUInt32LE(payload.length, 0);
  payload.copy(frame, 4);
  socket.write(frame);
}

function waitForConnection(socket: Socket, socketPath: string, timeoutMs: number): Promise<void> {
  if (!socket.connecting && socket.readyState === "open") return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: Error): void => {
      clearTimeout(timer);
      socket.off("connect", onConnect);
      socket.off("error", onError);
      socket.off("close", onClose);
      if (error) reject(error);
      else resolve();
    };
    const onConnect = (): void => finish();
    const onError = (error: Error): void => finish(connectionError(socketPath, error));
    const onClose = (): void => finish(new CodexDesktopIpcError(
      "connection-closed",
      `Codex Desktop IPC connection closed before connecting to ${socketPath}`
    ));
    const timer = setTimeout(() => {
      finish(new CodexDesktopIpcError(
        "connect-timeout",
        `Timed out connecting to Codex Desktop IPC at ${socketPath}`
      ));
      socket.destroy();
    }, timeoutMs);
    socket.once("connect", onConnect);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
}

function validateThreadSettings(settings: CodexDesktopThreadSettings): void {
  const keys = Object.keys(settings);
  if (keys.length === 0) throw new TypeError("threadSettings must include at least one setting");
  for (const key of keys) {
    if (key !== "serviceTier" && key !== "model" && key !== "effort") {
      throw new TypeError(`Unsupported Codex Desktop thread setting: ${key}`);
    }
  }
  if (settings.serviceTier !== undefined && settings.serviceTier !== null) {
    nonEmptyOption(settings.serviceTier, "threadSettings.serviceTier");
  }
  if (settings.model !== undefined) nonEmptyOption(settings.model, "threadSettings.model");
  if (settings.effort !== undefined && settings.effort !== null) {
    nonEmptyOption(settings.effort, "threadSettings.effort");
  }
}

function nonEmptyOption(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${name} must not be empty`);
  return normalized;
}

function positiveTimeout(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive integer`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function connectionError(socketPath: string, error: unknown): Error {
  const cause = asError(error);
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === "ENOENT" || code === "ECONNREFUSED") {
    return new CodexDesktopIpcError(
      code.toLowerCase(),
      `Codex Desktop IPC is unavailable at ${socketPath}; make sure Codex Desktop is running`
    );
  }
  return new CodexDesktopIpcError(
    typeof code === "string" ? code.toLowerCase() : "connection-error",
    `Unable to connect to Codex Desktop IPC at ${socketPath}: ${cause.message}`
  );
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
