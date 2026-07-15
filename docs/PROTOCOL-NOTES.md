# Protocol verification notes

## Verified baseline

- Date: 2026-07-15
- Codex CLI: `0.144.4`
- Stream Deck SDK library: `@elgato/streamdeck 2.1.0`
- Stream Deck manifest target: SDK 3, software 7.1+, Node.js 24
- Host smoke test: Windows 11 x64

The build generated the Codex TypeScript protocol schema from `codex app-server generate-ts` and implemented the stable fields used by this plugin. A real app-server smoke test completed initialization and `thread/list` successfully.

## Spec corrections applied

The supplied status-turn example used an older read-only sandbox object. In the verified schema, `turn/start.sandboxPolicy` uses:

```json
{ "type": "readOnly", "networkAccess": false }
```

The verified workspace-write form requires explicit writable roots and temp-directory flags:

```json
{
  "type": "workspaceWrite",
  "writableRoots": ["/absolute/project/root"],
  "networkAccess": false,
  "excludeTmpdirEnvVar": false,
  "excludeSlashTmp": false
}
```

`thread/resume` continues to take the coarse `sandbox` mode (`read-only` or `workspace-write`), while `turn/start` takes the full `sandboxPolicy` object.

## Approval routing

The adapter handles the current approval methods:

- `item/commandExecution/requestApproval` → `decline`
- `item/fileChange/requestApproval` → `decline`
- legacy `execCommandApproval` / `applyPatchApproval` → `denied`
- MCP elicitation → `decline`
- permission or unknown approval request → JSON-RPC error indicating policy decline

Every plugin-started turn also sets `approvalPolicy: "never"`, so these handlers are defense in depth rather than a normal interaction path.

The automated verification deliberately does not start a permissive turn merely to provoke an approval. That would violate the MVP's own safety policy. Approval response shapes are verified against the generated protocol schema; end-to-end approval routing should be exercised only in a disposable repository during a dedicated release qualification pass.

## Shared control plane

The MVP uses its own stdio app-server and the notify bridge fallback. Shared Unix-socket attachment is not a hard dependency and is not enabled on Windows. Future work can feature-detect the app-server control socket and subscribe through the documented Unix transport on supported Codex builds.

## Local desktop executable caveat

On the verification host, PowerShell resolved the Codex desktop package binary under `C:\Program Files\WindowsApps`, but direct execution returned access denied. The packaged plugin therefore treats `ENOENT` and `EACCES` as `SETUP`, retains cached project cards, and exposes an editable Codex executable path in the Property Inspector. The pinned public Codex CLI package passed the app-server smoke test.
