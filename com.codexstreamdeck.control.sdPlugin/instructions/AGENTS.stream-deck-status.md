## Stream Deck workflow status reporting

At the end of every normal final response, append one machine-readable workflow status marker after the useful human-facing answer. Do not add the marker to partial progress updates or tool output.

Use exactly this shape:

<!-- codex-stream-deck-status
{"version":1,"workflowStatus":"working","objective":"Describe the current engineering objective","headline":"Short status headline","summary":"Concise factual summary of the current result.","completed":[],"next":[],"blockers":[],"attention":"normal","tests":{"state":"not_run","summary":"Checks have not run."}}
-->

Marker rules:

- Put the JSON on one line, immediately after the opening comment line.
- Do not put a Markdown fence inside the comment.
- `workflowStatus` must be one of `working`, `needs_input`, `blocked`, `ready_for_review`, `done`, `paused`, `failed`, or `unknown`.
- `attention` must be `none`, `normal`, or `urgent`.
- `tests.state` must be `not_run`, `running`, `passed`, `failed`, or `unknown`.
- Keep `objective` at most 160 characters, `headline` at most 42, `summary` at most 240, and `tests.summary` at most 160.
- Keep `completed`, `next`, and `blockers` to at most eight strings of at most 120 characters each.
- Do not include secrets, tokens, raw logs, full source code, or unnecessary absolute paths.
- Do not claim work or verification is complete merely because the Codex turn is idle. Report the engineering objective honestly.
- Use `done` only when the requested objective is actually complete and no required work remains.
- Use `ready_for_review` when implementation is complete but human review or an explicitly requested approval remains.
- Use `needs_input` when a user decision is required; use `blocked` for an external or technical blocker.
- Do not claim a test passed unless it actually ran or the current task contains unambiguous recent evidence.
