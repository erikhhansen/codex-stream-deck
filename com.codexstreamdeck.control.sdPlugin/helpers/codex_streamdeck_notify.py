#!/usr/bin/env python3
"""Forward minimized Codex notify events to the local Stream Deck plugin."""

from __future__ import annotations

import json
import os
import secrets
import sys
import tempfile
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

MAX_BYTES = 256 * 1024
MAX_MESSAGE_BYTES = 192 * 1024
EVENT_TYPES = {"agent-turn-complete", "approval-requested"}


def truncate_utf8(value: str, limit: int) -> str:
    return value.encode("utf-8")[:limit].decode("utf-8", errors="ignore")


def serialize(event: dict) -> Optional[bytes]:
    payload = json.dumps(event, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return payload if len(payload) <= MAX_BYTES else None


def data_directory() -> Path:
    if sys.platform == "win32":
        return Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local")) / "CodexStreamDeck"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "CodexStreamDeck"
    return Path(os.environ.get("XDG_STATE_HOME", Path.home() / ".local" / "state")) / "codex-streamdeck"


def codex_home() -> Path:
    return Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))


def minimize(raw: dict) -> dict:
    message = raw.get("last-assistant-message", raw.get("lastAssistantMessage", ""))
    if not isinstance(message, str):
        message = ""
    event_type = str(raw.get("type", "unknown"))[:100]
    if event_type not in EVENT_TYPES:
        event_type = "unknown"
    return {
        "version": 1,
        "type": event_type,
        "threadId": str(raw.get("thread-id", raw.get("threadId", "")))[:200],
        "turnId": str(raw.get("turn-id", raw.get("turnId", "")))[:200],
        "cwd": str(raw.get("cwd", ""))[:32768],
        "lastAssistantMessage": truncate_utf8(message, MAX_MESSAGE_BYTES),
        "observedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


def send(event: dict) -> bool:
    endpoint_path = data_directory() / "notify-endpoint.json"
    try:
        endpoint = json.loads(endpoint_path.read_text(encoding="utf-8"))
        port = int(endpoint["port"])
        token = endpoint["token"]
        if endpoint.get("host") != "127.0.0.1" or not 1 <= port <= 65535:
            return False
        if not isinstance(token, str) or not 40 <= len(token) <= 200:
            return False
        body = serialize(event)
        if body is None:
            return False
        url = f"http://127.0.0.1:{port}/event"
        request = urllib.request.Request(
            url,
            data=body,
            method="POST",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=0.75) as response:
            return response.status == 204
    except (OSError, ValueError, KeyError, urllib.error.URLError):
        return False


def spool(event: dict) -> None:
    payload = serialize(event)
    if payload is None:
        return
    directory = codex_home() / "streamdeck-spool"
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    name = f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')}-{secrets.token_hex(8)}.json"
    fd, temporary = tempfile.mkstemp(prefix=".streamdeck-", suffix=".tmp", dir=directory)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, directory / name)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def main() -> int:
    if len(sys.argv) != 2:
        return 0
    encoded = sys.argv[1].encode("utf-8", errors="replace")
    if len(encoded) > MAX_BYTES:
        return 0
    try:
        raw = json.loads(sys.argv[1])
        if not isinstance(raw, dict):
            return 0
        event = minimize(raw)
        if event["type"] not in EVENT_TYPES or not event["threadId"] or not event["cwd"]:
            return 0
        if not send(event):
            spool(event)
    except (OSError, ValueError):
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
