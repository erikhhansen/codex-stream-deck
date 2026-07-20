# Codex Agent Keys

A deliberately small Stream Deck plugin for keeping several concurrent Codex sessions visible.

## Version 0.4

The **Codex Session** action pins, selects, and opens one exact Codex thread. Guarded macOS actions operate on that explicit target:

- **Approve** — approve the selected session's active request.
- **Reject** — reject the selected session's active request.
- **Terminal** — show or hide its integrated terminal.
- **Review** — toggle its review view.
- **Dictate** — press Codex's real Dictate control in its composer.
- **VS Code** — focus or open the Git repository for the selected task.
- **Codex Usage** — show the most constrained remaining allowance as a percentage; the footer shows both the rolling 5-hour and weekly windows.
- **Tokens Today** — total the token increases recorded in local Codex session logs since midnight and show a compact value such as `23.4M`.
- **Speed** — toggle the explicitly selected Codex session between Standard and the `priority` Fast service tier.
- **Model** — toggle the explicitly selected Codex session between the current SOL and TERRA models advertised by Codex.
- **Effort** — cycle the selected session through the effort levels advertised by its current model.
- **Merge Gate (Beta)** — show the selected task's highest local Git or GitHub pull-request blocker and open the relevant evidence.

1. Drag it onto a Stream Deck key.
2. Select the exact Codex session to pin.
3. Optionally give the key a shorter display name.
4. Tap the key to make it the active target and open that session in Codex.

The active target is stored as a stable Codex thread ID in Stream Deck global plugin settings. It does not depend on which macOS window happens to have focus. Its Agent key receives a blue accent border and green dot; those selection marks remain independent of the status color.

Dependent actions read this explicit target and remain guarded when it is empty. Approve and Reject are additionally guarded unless the plugin holds an exact, unresolved Codex approval request for that thread. They respond to that request ID through the Codex app-server protocol; they do not simulate Return or Escape. Generic permission-profile and user-input prompts are deliberately excluded because they cannot be safely reduced to yes/no. Selection can be cleared from the Agent key's property inspector; it does not need a dedicated physical key.

On macOS, Terminal, Review, and Dictate navigate to the stored thread and then operate directly on Codex Desktop. VS Code resolves the task's working directory to its Git worktree root, then opens that folder with VS Code's bundled launcher. Dictate presses Codex's native composer control, so it is not vulnerable to Snagit or another app intercepting a keyboard shortcut. Stream Deck must be allowed under **System Settings → Privacy & Security → Accessibility**.

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

Requires Node.js 24+, Stream Deck 7.1+, and an authenticated Codex CLI with app-server support.

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run validate
npm run pack
```

The generated installer is `com.codexstreamdeck.agentkeys.streamDeckPlugin`.

This project is intentionally independent from the larger inherited Codex Control plugin in the parent repository.

See [KEYSET-MAPPING.md](KEYSET-MAPPING.md) for a position-by-position interpretation of the Codex Micro icon keyset and the proposed Stream Deck rollout.
