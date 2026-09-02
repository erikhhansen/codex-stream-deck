# Codex Agent Keys

A shared Stream Deck and Stream Dock plugin for keeping several concurrent Codex sessions visible. Both packages are built from the same actions and controller; only the host manifest, image compatibility, settings persistence, and lifecycle behavior differ.

## Version 0.4

The **Codex Session** action pins, selects, and opens one exact Codex thread. Guarded macOS actions operate on that explicit target:

- **Approve** — approve the selected session's active request.
- **Reject** — reject the selected session's active request.
- **Terminal** — show or hide its integrated terminal.
- **Review** — toggle its review view.
- **Dictate** — press Codex's real Dictate control in its composer.
- **Capture to Codex** — capture a screen region and attach it to the current Codex draft without sending.
- **Do It** — replace the selected session's composer contents with `do it` and submit it.
- **Guide Me** — replace the selected session's composer contents with `Guide Me` and submit it.
- **Commit, Merge, Deploy** — replace the selected session's composer contents with `Commit, Merge, Deploy` and submit it.
- **VS Code** — focus or open the Git repository for the selected task.
- **GitHub** — open the selected task's `origin` repository on GitHub.
- **TextEdit** — open a new blank plain-text document without changing TextEdit's default document setting.
- **Codex Usage** — show the most constrained remaining allowance as a percentage; the footer shows both the rolling 5-hour and weekly windows.
- **Tokens Today** — show the current local date's exact token bucket from the same authenticated Codex profile data used by the Desktop Daily chart.
- **Speed** — toggle the explicitly selected Codex session between Standard and the `priority` Fast service tier.
- **Model** — toggle the explicitly selected Codex session between the current SOL and TERRA models advertised by Codex.
- **Effort** — cycle the selected session through the effort levels advertised by its current model.
- **Merge Gate (Beta)** — show the selected task's highest local Git or GitHub pull-request blocker and open the relevant evidence.

1. Drag it onto a Stream Deck or Stream Dock key.
2. Select the exact Codex session to pin.
3. Optionally give the key a shorter display name.
4. Tap the key to make it the active target and open that session in Codex.

The active target is stored as a stable Codex thread ID in the host's local application data. It does not depend on which macOS window happens to have focus. Its Agent key receives a blue accent border and green dot; those selection marks remain independent of the status color.

Dependent actions read this explicit target and remain guarded when it is empty. Approve and Reject are additionally guarded unless the plugin holds an exact, unresolved Codex approval request for that thread. They respond to that request ID through the Codex app-server protocol; they do not simulate Return or Escape. Generic permission-profile and user-input prompts are deliberately excluded because they cannot be safely reduced to yes/no. Selection can be cleared from the Agent key's property inspector; it does not need a dedicated physical key.

On macOS, Terminal, Review, Dictate, Do It, Guide Me, and Commit, Merge, Deploy navigate to the stored thread and then operate directly on Codex Desktop. VS Code resolves the task's working directory to its Git worktree root, then opens that folder with VS Code's bundled launcher. GitHub resolves the same worktree, converts its `origin` remote to an HTTPS GitHub URL, and opens it in the default browser. Dictate presses Codex's native composer control. The prompt buttons locate the composer beside that control, replace its contents with their respective prompt, and submit it. Capture to Codex invokes the installed menu-bar helper and targets whichever Codex task is currently active; each press adds one image to the draft without pressing Return. The active host must be allowed under **System Settings → Privacy & Security → Accessibility**.

### Codex task ownership

Agent Keys uses Codex app-server only for read-only task listing, status, account limits, and model catalog data. Model, effort, and speed indicators are read from the local session JSONL or from settings explicitly changed through Codex Desktop IPC. Passive refresh and approval recovery never call `thread/resume`, because that method acquires a task writer lock and can make Codex Desktop report that the task is active elsewhere.

Speed, Model, and Effort are read-only indicators. They show the values reported for the Agent key marked as the active target and deliberately perform no action when pressed.

### Merge Gate beta

Merge Gate follows the Agent key marked as the active target. It inspects that task's Git worktree and its current GitHub pull request, then shows the first actionable delivery blocker. A short press refreshes the result and opens the relevant failing check, pull request, compare page, or local repository in VS Code. Hold for 650 ms to open the pull request directly.

Install the [GitHub CLI](https://cli.github.com/) and run `gh auth login` before using GitHub-backed states. Merge Gate uses that existing authentication and stores no GitHub token. It is strictly read-only: it never changes Git state, approves a review, or merges a pull request.

`MERGEABLE` means only that the local worktree is clean, the open non-draft pull request matches local HEAD, supported checks are clear, required reviews have no blocker, and GitHub reports a clean mergeable state. Missing tools, unsupported remotes, network failures, or ambiguous GitHub data display `UNKNOWN`; they can never produce a green key.

The whole key uses the current status color:

| State | Color | Meaning |
| --- | --- | --- |
| `IDLE` | White | The session is not actively working and needs no explicit response. |
| `THINKING` | Blue | Codex is actively working. |
| `COMPLETE` | Green | A turn just completed. |
| `WAITING` / `NEEDS INPUT` / `APPROVAL` | Flashing yellow | The session is waiting for you. |
| `ERROR` | Pink | The connection or session reported an error. |

`COMPLETE` remains visible briefly, then changes to `IDLE`. Yellow flashing is reserved for an explicit approval or user-input request.

## Development

Requires an authenticated Codex CLI with app-server support. Stream Deck uses SDK 3, Node.js 24, and Stream Deck 7.1+. Stream Dock uses SDK 1, Node.js 20, and Stream Dock 3.10.188.226+.

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run validate
npm run package:streamdeck
npm run package:streamdock
```

The canonical plugin directory contains the modern Stream Deck manifest. `package:streamdeck` creates the validated Stream Deck package. `package:streamdock` creates a separate legacy-manifest package in `dist/`; it never overwrites the canonical manifest. Both packages contain the same action UUIDs and JavaScript runtime.

This project is independent from the larger Codex Control dashboard in the parent repository. Codex Control remains a distinct product surface; it is not the Stream Deck edition of Agent Keys.

See [KEYSET-MAPPING.md](KEYSET-MAPPING.md) for a position-by-position interpretation of the Codex Micro icon keyset and the proposed Stream Deck rollout.
