#!/usr/bin/env python3
"""Run an existing Codex notifier and the Stream Deck bridge without a shell."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


MAX_CONFIG_BYTES = 64 * 1024
MAX_COMMANDS = 4
MAX_ARGUMENTS = 32


def valid_command(command: object) -> bool:
    return (
        isinstance(command, list)
        and 0 < len(command) <= MAX_ARGUMENTS
        and all(isinstance(value, str) and "\0" not in value and len(value) <= 32768 for value in command)
    )


def main() -> int:
    if len(sys.argv) != 3:
        return 0
    try:
        config_path = Path(sys.argv[1])
        if config_path.stat().st_size > MAX_CONFIG_BYTES:
            return 0
        config = json.loads(config_path.read_text(encoding="utf-8"))
        commands = config.get("commands", []) if isinstance(config, dict) else []
        if not isinstance(commands, list):
            return 0
        for command in commands[:MAX_COMMANDS]:
            if valid_command(command):
                try:
                    subprocess.run([*command, sys.argv[2]], shell=False, timeout=5, check=False)
                except (OSError, subprocess.SubprocessError):
                    pass
    except (OSError, ValueError):
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
