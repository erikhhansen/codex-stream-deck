import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";

import type { RpcId } from "./approval.js";
import type { CodexThread } from "./types.js";

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class CodexClient extends EventEmitter {
  #child: ChildProcessWithoutNullStreams | undefined;
  #buffer = "";
  #nextId = 1;
  #pending = new Map<RpcId, Pending>();
  #stderr = "";

  get connected(): boolean {
    return !!this.#child && this.#child.exitCode === null;
  }

  async start(codexPath: string): Promise<void> {
    await this.stop();
    this.#stderr = "";
    const javascriptEntry = /\.m?js$/i.test(codexPath);
    const command = javascriptEntry ? process.execPath : codexPath;
    const child = spawn(command, [...(javascriptEntry ? [codexPath] : []), "app-server", "--listen", "stdio://"], {
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.#child = child;
    child.stdout.on("data", (chunk: Buffer) => this.#onData(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      this.#stderr = `${this.#stderr}${chunk.toString("utf8")}`.slice(-2_000);
    });
    child.on("exit", () => {
      if (this.#child === child) {
        const detail = this.#stderr.trim().split(/\r?\n/).at(-1);
        this.#disconnect(new Error(detail ? `Codex app-server stopped: ${detail}` : "Codex app-server stopped"));
      }
    });
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    await this.request("initialize", {
      clientInfo: { name: "codex_agent_keys", title: "Codex Agent Keys", version: "0.3.15" }
    }, 15_000);
    this.notify("initialized", {});
  }

  async stop(): Promise<void> {
    const child = this.#child;
    this.#child = undefined;
    if (child && child.exitCode === null) {
      child.kill();
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1_500);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
      if (child.exitCode === null) child.kill("SIGKILL");
    }
    this.#rejectAll(new Error("Codex app-server stopped"));
  }

  request<T = unknown>(method: string, params: Record<string, unknown>, timeoutMs = 15_000): Promise<T> {
    if (!this.#child?.stdin.writable) return Promise.reject(new Error("Codex is not connected"));
    const id = this.#nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, timeoutMs);
      this.#pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
      this.#send({ id, method, params });
    });
  }

  notify(method: string, params: Record<string, unknown>): void {
    this.#send({ method, params });
  }

  respond(id: RpcId, result: Record<string, unknown>): void {
    this.#send({ id, result });
  }

  respondError(id: RpcId, code: number, message: string): void {
    this.#send({ id, error: { code, message } });
  }

  async listThreads(): Promise<CodexThread[]> {
    const response = await this.request<{ data?: CodexThread[] }>("thread/list", {
      limit: 100,
      sortKey: "recency_at",
      sortDirection: "desc",
      archived: false
    }, 30_000);
    return Array.isArray(response.data) ? response.data : [];
  }

  #send(message: Record<string, unknown>): void {
    if (!this.#child?.stdin.writable) throw new Error("Codex is not connected");
    this.#child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #onData(chunk: Buffer): void {
    this.#buffer += chunk.toString("utf8");
    if (Buffer.byteLength(this.#buffer, "utf8") > 5 * 1024 * 1024) {
      this.#disconnect(new Error("Codex response exceeded 5 MiB"));
      return;
    }
    const lines = this.#buffer.split(/\r?\n/);
    this.#buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        this.#onMessage(JSON.parse(line) as Record<string, unknown>);
      } catch {
        // Ignore malformed output; a later valid response can still complete the request.
      }
    }
  }

  #onMessage(message: Record<string, unknown>): void {
    if (typeof message.method === "string") {
      const params = message.params && typeof message.params === "object" && !Array.isArray(message.params)
        ? message.params as Record<string, unknown>
        : {};
      if (typeof message.id === "string" || typeof message.id === "number") {
        this.emit("serverRequest", message.id, message.method, params);
      } else {
        this.emit("notification", message.method, params);
      }
      return;
    }
    const id = message.id;
    if (typeof id !== "string" && typeof id !== "number") return;
    const pending = this.#pending.get(id);
    if (!pending) return;
    this.#pending.delete(id);
    clearTimeout(pending.timer);
    if (message.error && typeof message.error === "object") {
      const error = message.error as { message?: unknown };
      pending.reject(new Error(typeof error.message === "string" ? error.message : "Codex request failed"));
    } else pending.resolve(message.result);
  }

  #disconnect(error: Error): void {
    this.#child = undefined;
    this.#rejectAll(error);
    this.emit("exit", error);
  }

  #rejectAll(error: Error): void {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
  }
}
