# Codex Micro icon-keyset mapping

This table records the default mappings found in the Codex desktop app installed on this Mac on 2026-07-18. It is a guide to the supplied 32-key artwork, not an immutable specification: Work Louder states that the Codex Micro controls are fully remappable.

Sources:

- [OpenAI — Codex Micro](https://openai.com/supply/co-lab/work-louder/)
- [Work Louder — Codex Micro](https://worklouder.cc/codex-micro)
- [Work Louder — Input configurator](https://worklouder.cc/input)

| Position | Artwork | Installed Codex default |
| --- | --- | --- |
| R1C1 | Bug | Open feedback |
| R1C2 | OpenAI mark | Open OpenAI developer docs |
| R1C3 | Terminal | Toggle terminal |
| R1C4 | Down arrow | Copy chat as Markdown |
| R1C5 | Trash | Archive chat |
| R1C6 | Compose/pencil | New chat |
| R1C7 | Pointer/paper plane | Open browser tab |
| R1C8 | Star | Pin or unpin chat |
| R1C9 | Diff/window | Toggle review |
| R1C10 | Play | Run the primary environment action |
| R2C1 | Git/diff nodes | Commit or push |
| R2C2 | Draft branch | Toggle review |
| R2C3 | Merged branch | Toggle review |
| R2C4 | Pull request | Create a pull request |
| R2C5 | Paint/broom | Add photos |
| R2C6 | Flask | Open Settings |
| R2C7 | Confetti | Open side chat |
| R2C8 | Clock | Open Scheduled |
| R2C9 | Filled/detailed brain | Increase reasoning effort |
| R2C10 | Outline brain | Decrease reasoning effort |
| R3C1 | Lightning | Toggle Fast mode |
| R3C2 | Check | Approve the active request |
| R3C3 | X | Decline the active request |
| R3C4 | Fork/diagonal arrows | Continue in a new chat/task |
| R3C5 | Gear | Open Settings |
| R3C6 | Folder plus | Open folder |
| R3C7 | Cloud upload | Attach files or folders |
| R3C8 | Four dots | Open plugins |
| R3C9 | `YOLO` | Insert `:yolo:` in the composer |
| R3C10 | `YEET` | Insert `:yeet:` in the composer |
| Bottom 2U | Microphone | Push-to-talk |
| Bottom 1U | Codex/chat | Send message |

## The first five Stream Deck action keys

The plugin mirrors five commonly useful desktop actions for the explicitly selected Agent key:

1. **Approve** — approve the selected task's exact pending Codex request.
2. **Reject** — decline the selected task's exact pending Codex request.
3. **Terminal** — activate the selected task and toggle its terminal.
4. **Review** — activate the selected task and toggle its review view.
5. **Dictate** — activate the selected task and press its native Dictate composer control.

Terminal, Review, and Dictate first navigate to the exact stored Codex task ID. Approve and Reject instead answer the exact app-server request ID captured for that selected task and are guarded when there is no actionable pending request. All five are guarded when no Agent key is selected.

The Stream Deck microphone action is **Dictate**, not live Voice Mode or hardware push-to-talk. Codex Micro's microphone has direct audio integration that an external Stream Deck plugin does not have.
