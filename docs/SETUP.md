# Complete setup

This guide covers a normal end-user installation, a source build, the recommended Stream Deck layout, optional passive updates, troubleshooting, and removal.

## 1. Prerequisites

You need:

- Stream Deck 7.1 or later on Windows 10/11 or macOS 13+
- A Stream Deck device or Stream Deck Mobile
- Codex CLI with `app-server` support
- A signed-in Codex session
- Python 3 only for the optional passive notify bridge
- An editor launcher such as `code` only for **Open Code** actions

Verify Codex from PowerShell or a terminal:

```powershell
codex --version
codex login status
```

If you are not signed in, run:

```powershell
codex login
```

The official Codex app-server uses a local JSONL/stdio transport by default. This plugin starts its own child app-server process; it does not expose a Codex WebSocket port.

## 2. Install the plugin

### Packaged installer

1. Download `com.codexstreamdeck.control.streamDeckPlugin` from GitHub Releases.
2. Double-click the file.
3. Approve the installation in Stream Deck.
4. Restart Stream Deck if **Codex Control** does not appear in the action list.

### Build it yourself

Install Node.js 24, clone the repository, and run:

```powershell
npm ci
npm run check
npm run pack
```

Double-click the generated `.streamDeckPlugin` file.

For a linked development installation:

```powershell
npx streamdeck link com.codexstreamdeck.control.sdPlugin
npm run dev
```

## 3. Create the profile

In Stream Deck:

1. Create or select a profile named **Codex Control**.
2. Drag eight **Recent Codex Project** actions into the first eight positions.
3. Add **Refresh Codex Projects** and **Codex Connection Health**.
4. Add any action keys you want: **New Codex Task**, **Open Project in Editor**, **Review Project Changes**, **Interrupt Codex Turn**, **Open Codex Settings**, or **Open Codex Skills**.

Suggested 15-key layout:

```text
[Project 1] [Project 2] [Project 3] [Project 4] [Project 5]
[Project 6] [Project 7] [Project 8] [Refresh  ] [Health   ]
[New Task ] [Open Code] [Review   ] [Interrupt] [Settings ]
```

Project actions default to their physical key position. Select a project key to change:

- automatic slot number
- pinned project root and task ID
- tap behavior: open Codex, open editor, open both, or check status
- display-name override
- freshness and attention badges

## 4. Connect Codex

Select any Codex Control key and use its Property Inspector:

1. Leave **Codex executable** as `codex` when the CLI is on `PATH`.
2. Click **Test Codex**.
3. Click **Refresh all**.
4. Confirm the **Health** key reads `CONNECTED`.

If `codex` is unavailable to Stream Deck, enter the absolute path to a trusted Codex executable. The plugin invokes that executable directly with `shell: false`; do not point it at a wrapper or binary you do not trust.

The Microsoft Store desktop bundle can place an app-private `codex.exe` where unrelated processes cannot execute it. In that case, install the public Codex CLI or configure another executable path that your user account can run.

## 5. Use project keys

- Quick tap: perform the selected tap action; by default this opens the exact Codex task.
- Hold for at least 650 ms: request a fresh status report.
- `NO STATUS`: no structured report exists yet.
- `HOLD TO CHECK`: hold the same key to request one.
- `UPDATED 3H`: the report was observed three hours ago.

The status check runs with a read-only sandbox, tool network access disabled, and approval policy `never`. It can update Codex task-goal metadata after validating the result, but cannot modify project files.

## 6. Enable passive cross-client updates (optional)

Without this step, the project list still refreshes and holds still request status. The notify bridge adds completion and approval updates from normal work in Codex desktop, CLI, and IDE.

### Install the local bridge

1. Select any Codex Control key.
2. In the Property Inspector, click **Install notify bridge**.
3. Note the displayed backup path.
4. Restart open Codex clients.

The installer:

- copies two small Python helpers to the local Codex Stream Deck data directory
- adds a user-level `notify = [...]` entry to `~/.codex/config.toml`
- creates a timestamped config backup before replacement
- chains a simple existing notifier after validating its argument-array syntax
- never invokes a shell

### Add global status instructions

Append [AGENTS.stream-deck-status.md](../com.codexstreamdeck.control.sdPlugin/instructions/AGENTS.stream-deck-status.md) to `~/.codex/AGENTS.md`. If `~/.codex/AGENTS.override.md` exists, Codex uses that instead of the global `AGENTS.md`; add the instructions there or remove the override.

Codex reads global and project `AGENTS.md` instructions when a session starts, so restart existing clients or start a new task after editing the file.

## 7. Configure action keys

Targeted utility actions have a **slot position**. Position `0` means the highest-priority recent project, `1` the next, and so on.

**New Task** supports two modes:

- **Run automatically**: starts a task with writes limited to the selected project root, tool network access disabled, and approval policy `never`.
- **Prefill in Codex**: opens a composer and hands execution back to the user.

**Interrupt** works only for turns started by this plugin and requires a hold. It never guesses a turn ID.

## 8. Local data

The plugin stores bounded local state in:

- Windows: `%LOCALAPPDATA%\CodexStreamDeck`
- macOS: `~/Library/Application Support/CodexStreamDeck`

Optional notify events can spool under `~/.codex/streamdeck-spool` while Stream Deck is unavailable. Diagnostic logs are rotated at 1 MiB and redact token-shaped secrets. The cache can contain task titles, project roots, task IDs, runtime state, and short structured status summaries; protect your operating-system account accordingly.

## 9. Troubleshooting

### Health says `SETUP`

- Run `codex --version` in a normal terminal.
- Enter a trusted absolute Codex executable path in the Property Inspector.
- Click **Test Codex**.
- Restart Stream Deck after changing the path.

### Health says `AUTH`

Run `codex login`, complete browser authentication, and press **Health** to reconnect.

### No project labels appear

- Press **Refresh**.
- Confirm unarchived Codex tasks have a valid working directory.
- Increase **Recent horizon (days)**.
- Confirm the profile uses **Recent Codex Project** actions from the current neutral plugin namespace.

### A key says `NO STATUS`

Hold it for about one second. The button should temporarily show `RUNNING`, then display the validated result and its age. An active task owned by another Codex client must be opened there rather than interrupted by the plugin.

### Passive updates do not arrive

- Confirm Python 3 is installed.
- Run **Install notify bridge** again; it is idempotent for the direct helper command.
- Restart Codex clients.
- Confirm the global status instructions are in the active `AGENTS.md` or `AGENTS.override.md`.
- Open **Diagnostics folder** and inspect the redacted log.

### Stream Deck does not show the plugin

Restart Stream Deck. Elgato notes that plugins can temporarily fail to appear when the Stream Deck app is running with elevated privileges after an install or update.

## 10. Remove everything

1. Uninstall **Codex Control** from Stream Deck.
2. Restore the newest `config.toml.streamdeck-backup-*` file created by the bridge installer, or carefully remove the Stream Deck `notify` entry while preserving any pre-existing notifier.
3. Remove the Stream Deck status block from your global Codex `AGENTS.md` or `AGENTS.override.md`.
4. After confirming you no longer need diagnostics or cached state, remove the `CodexStreamDeck` local data directory and `~/.codex/streamdeck-spool`.
5. Restart Codex clients.

## Official references

- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- [Codex authentication](https://learn.chatgpt.com/docs/authentication)
- [Custom instructions with `AGENTS.md`](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Stream Deck SDK prerequisites](https://docs.elgato.com/streamdeck/sdk/v1/introduction/getting-started/)
- [Stream Deck packaging](https://docs.elgato.com/streamdeck/cli/commands/pack/)
