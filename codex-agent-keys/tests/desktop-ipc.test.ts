import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Socket } from "node:net";

import { describe, expect, it } from "vitest";

import {
  CODEX_DESKTOP_IPC_MAX_FRAME_BYTES,
  CodexDesktopIpcClient,
  CodexDesktopIpcError,
  type CodexDesktopThreadSettings
} from "../src/desktop-ipc.js";

describe("Codex Desktop IPC", () => {
  it("uses the exact versioned envelopes and handles fragmented/coalesced frames", async () => {
    const received: Record<string, unknown>[] = [];
    const socket = createFakeRouter((socket, message) => {
      received.push(message);
      const requestId = message.requestId;
      if (typeof requestId !== "string") return;

      if (message.method === "initialize") {
        const response = encodeFrame({
          type: "response",
          requestId,
          resultType: "success",
          method: "initialize",
          handledByClientId: "desktop-router",
          result: { clientId: "agent-keys-client" }
        });
        socket.emit("data", response.subarray(0, 2));
        setImmediate(() => socket.emit("data", response.subarray(2)));
        return;
      }

      if (message.method === "thread-follower-update-thread-settings") {
        const unrelatedBroadcast = encodeFrame({
          type: "broadcast",
          method: "client-status-changed",
          sourceClientId: "another-client",
          version: 1,
          params: { status: "connected" }
        });
        const response = encodeFrame({
          type: "response",
          requestId,
          resultType: "success",
          method: "thread-follower-update-thread-settings",
          handledByClientId: "codex-desktop-owner",
          result: { ok: true }
        });
        socket.emit("data", Buffer.concat([unrelatedBroadcast, response]));
      }
    });
    const requestIds = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"];
    const client = new CodexDesktopIpcClient({
      socketPath: "/fake/codex-ipc.sock",
      connectionFactory: () => socket,
      requestIdFactory: () => requestIds.shift() ?? "unexpected-request-id"
    });

    await client.updateThreadSettings("thread-123", {
      serviceTier: "priority",
      model: "gpt-5.6-sol",
      effort: "ultra"
    });

    expect(client.connected).toBe(true);
    expect(client.clientId).toBe("agent-keys-client");
    expect(received).toEqual([
      {
        type: "request",
        requestId: "00000000-0000-4000-8000-000000000001",
        sourceClientId: "initializing-client",
        version: 0,
        method: "initialize",
        params: { clientType: "stream-dock" }
      },
      {
        type: "request",
        requestId: "00000000-0000-4000-8000-000000000002",
        sourceClientId: "agent-keys-client",
        version: 1,
        method: "thread-follower-update-thread-settings",
        params: {
          conversationId: "thread-123",
          threadSettings: {
            serviceTier: "priority",
            model: "gpt-5.6-sol",
            effort: "ultra"
          }
        },
        timeoutMs: 5_000
      }
    ]);

    client.close();
  });

  it.each(["no-client-found", "request-version-mismatch"])(
    "preserves the %s router error code for actionable handling",
    async (routerError) => {
      const socket = createFakeRouter((socket, message) => {
        const requestId = message.requestId;
        if (typeof requestId !== "string") return;
        if (message.method === "initialize") {
          socket.emit("data", encodeFrame({
            type: "response",
            requestId,
            resultType: "success",
            method: "initialize",
            handledByClientId: "desktop-router",
            result: { clientId: "agent-keys-client" }
          }));
        } else {
          socket.emit("data", encodeFrame({
            type: "response",
            requestId,
            resultType: "error",
            error: routerError
          }));
        }
      });
      const client = new CodexDesktopIpcClient({
        socketPath: "/fake/codex-ipc.sock",
        connectionFactory: () => socket
      });

      await expect(client.updateThreadSettings("unowned-thread", { serviceTier: null })).rejects.toMatchObject({
        name: "CodexDesktopIpcError",
        code: routerError,
        message: `Codex Desktop IPC request failed: ${routerError}`
      });
      expect(client.connected).toBe(true);

      client.close();
    }
  );

  it("rejects a successful settings response that does not confirm the update", async () => {
    const socket = createFakeRouter((socket, message) => {
      const requestId = message.requestId;
      if (typeof requestId !== "string") return;
      socket.emit("data", encodeFrame(message.method === "initialize"
        ? {
            type: "response",
            requestId,
            resultType: "success",
            method: "initialize",
            handledByClientId: "desktop-router",
            result: { clientId: "agent-keys-client" }
          }
        : {
            type: "response",
            requestId,
            resultType: "success",
            method: "thread-follower-update-thread-settings",
            handledByClientId: "codex-desktop-owner",
            result: { ok: false }
          }));
    });
    const client = new CodexDesktopIpcClient({
      socketPath: "/fake/codex-ipc.sock",
      connectionFactory: () => socket
    });

    await expect(client.updateThreadSettings("thread-123", { model: "gpt-5.6-sol" })).rejects.toMatchObject({
      name: "CodexDesktopIpcError",
      code: "invalid-response"
    });

    client.close();
  });

  it("times out a settings request that the router does not answer", async () => {
    const socket = createFakeRouter((socket, message) => {
      const requestId = message.requestId;
      if (message.method !== "initialize" || typeof requestId !== "string") return;
      socket.emit("data", encodeFrame({
        type: "response",
        requestId,
        resultType: "success",
        method: "initialize",
        handledByClientId: "desktop-router",
        result: { clientId: "agent-keys-client" }
      }));
    });
    const client = new CodexDesktopIpcClient({
      socketPath: "/fake/codex-ipc.sock",
      connectionFactory: () => socket,
      requestTimeoutMs: 20
    });

    const error = await client.updateThreadSettings("thread-123", { effort: "high" }).catch((caught) => caught);
    expect(error).toBeInstanceOf(CodexDesktopIpcError);
    expect(error).toMatchObject({ code: "timeout" });
    expect(client.connected).toBe(true);

    client.close();
  });

  it("rejects an invalid frame and tears down the connection", async () => {
    const socket = createFakeRouter((socket, message) => {
      if (message.method !== "initialize") return;
      const invalidHeader = Buffer.alloc(4);
      invalidHeader.writeUInt32LE(CODEX_DESKTOP_IPC_MAX_FRAME_BYTES + 1, 0);
      socket.emit("data", invalidHeader);
    });
    const client = new CodexDesktopIpcClient({
      socketPath: "/fake/codex-ipc.sock",
      connectionFactory: () => socket
    });

    await expect(client.connect()).rejects.toMatchObject({
      name: "CodexDesktopIpcError",
      code: "protocol-error"
    });
    expect(client.connected).toBe(false);
  });

  it("reports a missing desktop socket without hanging", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codex-agent-keys-missing-ipc-"));
    const socketPath = join(directory, "missing.sock");
    const client = new CodexDesktopIpcClient({ socketPath, connectTimeoutMs: 200 });
    try {
      await expect(client.connect()).rejects.toMatchObject({
        name: "CodexDesktopIpcError",
        code: "enoent"
      });
    } finally {
      client.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("validates settings before opening a connection", async () => {
    const client = new CodexDesktopIpcClient({ socketPath: "/unused" });

    await expect(client.updateThreadSettings("thread-123", {})).rejects.toThrow(
      "threadSettings must include at least one setting"
    );
    await expect(client.updateThreadSettings("", { model: "gpt-5.6-sol" })).rejects.toThrow(
      "conversationId must not be empty"
    );
    await expect(client.updateThreadSettings("thread-123", { model: "  " })).rejects.toThrow(
      "threadSettings.model must not be empty"
    );
    await expect(client.updateThreadSettings("thread-123", { serviceTier: "" })).rejects.toThrow(
      "threadSettings.serviceTier must not be empty"
    );
    await expect(client.updateThreadSettings("thread-123", { effort: "\t" })).rejects.toThrow(
      "threadSettings.effort must not be empty"
    );
    await expect(client.updateThreadSettings(
      "thread-123",
      { unsupported: true } as unknown as CodexDesktopThreadSettings
    )).rejects.toThrow("Unsupported Codex Desktop thread setting: unsupported");
  });
});

function createFakeRouter(onMessage: (socket: Socket, message: Record<string, unknown>) => void): Socket {
  const socket = new Socket();
  let buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  socket.write = ((chunk: Uint8Array | string) => {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk);
    buffer = buffer.length === 0 ? bytes : Buffer.concat([buffer, bytes]);
    while (buffer.length >= 4) {
      const length = buffer.readUInt32LE(0);
      if (buffer.length < length + 4) return true;
      const parsed = JSON.parse(buffer.subarray(4, length + 4).toString("utf8")) as unknown;
      buffer = buffer.subarray(length + 4);
      if (isRecord(parsed)) onMessage(socket, parsed);
    }
    return true;
  }) as typeof socket.write;
  return socket;
}

function encodeFrame(message: Record<string, unknown>): Buffer {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  const frame = Buffer.alloc(payload.length + 4);
  frame.writeUInt32LE(payload.length, 0);
  payload.copy(frame, 4);
  return frame;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
