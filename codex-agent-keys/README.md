# Codex Agent Keys

A deliberately small Stream Deck plugin for keeping several concurrent Codex sessions visible.

## Version 0.3

The **Codex Session** action pins, selects, and opens one exact Codex thread. Guarded macOS actions operate on that explicit target:

- **Approve** — approve the selected session's active request.
- **Reject** — reject the selected session's active request.
- **Terminal** — show or hide its integrated terminal.
- **Review** — toggle its review view.
- **Dictate** — press Codex's real Dictate control in its composer.
- **VS Code** — focus or open the Git repository for the selected task.

1. Drag it onto a Stream Deck key.
2. Select the exact Codex session to pin.
3. Optionally give the key a shorter display name.
4. Tap the key to make it the active target and open that session in Codex.

The active target is stored as a stable Codex thread ID in Stream Deck global plugin settings. It does not depend on which macOS window happens to have focus. Its Agent key receives a blue accent border and green dot; those selection marks remain independent of the status color.

Dependent actions read this explicit target and remain guarded when it is empty. Approve and Reject are additionally guarded unless the plugin holds an exact, unresolved Codex approval request for that thread. They respond to that request ID through the Codex app-server protocol; they do not simulate Return or Escape. Generic permission-profile and user-input prompts are deliberately excluded because they cannot be safely reduced to yes/no. Selection can be cleared from the Agent key's property inspector; it does not need a dedicated physical key.

On macOS, Terminal, Review, and Dictate navigate to the stored thread and then operate directly on the Codex process. VS Code resolves the task's working directory to its Git worktree root, then opens that folder with VS Code's bundled launcher. Dictate presses Codex's native composer control, so it is not vulnerable to Snagit or another app intercepting a keyboard shortcut. Stream Deck must be allowed under **System Settings → Privacy & Security → Accessibility**.

The whole key uses the current status color:

| State | Color | Meaning |
| --- | --- | --- |
| `IDLE` | White | The session is not loaded. |
| `THINKING` | Blue | Codex is actively working. |
| `COMPLETE` | Green | A turn just completed. |
| `WAITING` / `NEEDS INPUT` / `APPROVAL` | Flashing yellow | The session is waiting for you. |
| `ERROR` | Pink | The connection or session reported an error. |

`COMPLETE` remains visible briefly, then a loaded idle session changes to flashing `WAITING` so completed work does not disappear into the background.

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
