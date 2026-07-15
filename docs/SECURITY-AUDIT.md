# Security audit

Audit date: 2026-07-15

Scope: TypeScript plugin, Property Inspector, Python notify helpers, build configuration, dependency lockfile, package inventory, local persistence, and release metadata.

## Executive summary

No known npm vulnerabilities or committed secrets were found. The review identified several hardening and privacy issues before public release; all listed findings were fixed and covered by tests or automated release checks. No project action uses a shell, no action can approve a Codex request, and no network listener binds beyond loopback.

## Automated evidence

- `npm audit`: 0 info, low, moderate, high, or critical vulnerabilities across 206 dependencies
- `npm audit signatures`: 149 packages with verified registry signatures; 40 with verified attestations
- TypeScript strict mode: passed
- Unit and security tests: passed
- Stream Deck manifest/package validation: passed
- Release privacy scan: no local user paths, private keys, or token-shaped credentials
- Secret-pattern sweep: no personal name, email, local user path, cloud-storage path, API key, GitHub token, or private key in release inputs

Advisory databases and package signatures are time-sensitive; CI and Dependabot continue these checks after publication.

## Findings remediated

### AUD-01 — Identifying release metadata

Severity: privacy/high for a public release

Status: fixed

The original plugin namespace and manifest author identified an individual. The plugin and action UUIDs now use the neutral `com.codexstreamdeck.control` namespace, the manifest author is `Codex Stream Deck Contributors`, the release scanner rejects absolute user paths, and repository-local commit metadata is non-identifying.

### AUD-02 — Malformed app-server envelope handling

Severity: medium

Status: fixed

JSONL frames were bounded and JSON parse failures were handled, but a valid JSON primitive or malformed response shape could reach object-only logic. The adapter now validates record envelopes, method names, request/response IDs, parameter objects, and error fields before use. Completed-turn cache entries are cleared after consumption and capped at 20.

### AUD-03 — Untrusted settings normalization

Severity: medium

Status: fixed

Persisted Stream Deck settings are local but cross a WebSocket and JSON boundary. All booleans, numbers, strings, arrays, task IDs, prompts, paths, and display labels are now explicitly normalized, bounded, and checked for null/control characters before use.

### AUD-04 — Notify event validation and resource limits

Severity: medium

Status: fixed

The bridge already used a random token and loopback binding. It now additionally requires JSON content type, loopback remote address, version 1, an allow-listed event type, bounded identifier grammar, an absolute null-free working directory, request/header timeouts, short keep-alive, limited headers, and explicit 413 handling. Assistant messages are truncated by UTF-8 bytes.

### AUD-05 — Python helper byte handling

Severity: low

Status: fixed

Character slicing could produce a serialized non-ASCII payload larger than the server's byte limit, leaving an undrainable spool file. The helper now serializes once with UTF-8, enforces a 256 KiB event limit, bounds message bytes, validates endpoint host/port/token, and rejects unknown event types. The notifier-chain helper limits config size, command count, argument count, argument length, and null bytes.

### AUD-06 — Property Inspector browser policy

Severity: low

Status: fixed

The local Property Inspector lacked an explicit Content Security Policy and assumed all WebSocket messages were valid JSON. It now permits only local scripts/styles/images and the Stream Deck loopback WebSocket, validates the port, and ignores malformed messages.

## Existing controls confirmed

- All process execution uses `spawn` or `execFile` with `shell: false`.
- Deep links are parsed and allow-listed.
- Dynamic SVG strings are control-stripped and XML-escaped.
- Status output must satisfy a closed JSON Schema with strict size and field limits.
- Status and review turns use read-only policy; new plugin-owned tasks use a project-root-only workspace policy.
- Tool network access is disabled for status, review-resume, and plugin-owned task starts.
- Approval, permission, elicitation, and user-input server requests are declined.
- Interrupt applies only to an exact plugin-owned turn ID and requires a hold.
- Cache and spool writes use bounded data and atomic replacement; symlink spool entries are ignored.
- Diagnostic logs are size-bounded, rotated, and secret-redacted.

## Residual risks and trust assumptions

1. The configured Codex and editor executables are trusted local user settings. Pointing them at a malicious executable will run that executable as the user.
2. The plugin uses the user's normal authenticated Codex session. A model turn necessarily sends prompt/context through Codex even though tool network access is disabled.
3. Task titles, project roots, IDs, and short status summaries are cached locally. Operating-system account compromise is out of scope.
4. The loopback bearer token protects against unrelated local processes that cannot read the endpoint file. A process already running as the same user may be able to read local files and is outside the primary threat model.
5. The optional installer changes user-level Codex configuration after an explicit button press and creates a backup. Complex existing TOML notifier syntax is refused rather than rewritten.
6. The app-server protocol can evolve. The plugin fails closed on unknown server-initiated requests and reports incompatible connections, but future Codex versions can require adapter changes.
7. Dependency audit results can change after release. Dependabot, CI advisory checks, exact pins, and registry-signature checks reduce but do not eliminate supply-chain risk.

## Threat model

In scope:

- malformed task metadata and app-server messages
- hostile display strings and SVG injection
- malformed persisted settings
- unauthenticated or oversized loopback notify requests
- path traversal and null-byte injection
- shell/argument injection
- accidental approval or over-broad sandboxing
- credential or local-path leakage in logs and public release files
- dependency advisories and package provenance

Out of scope:

- a fully compromised operating-system user account
- a malicious trusted Codex or editor executable selected by the user
- vulnerabilities in Stream Deck, the operating system, Python, Git, Node.js, or Codex itself
- physical access to an unlocked computer or Stream Deck

## Recommended follow-up

- Review Dependabot updates and CI failures promptly.
- Re-run this audit when adding a process launch, network route, new persisted field, or new Codex method.
- Regenerate app-server schemas against the supported Codex version before a protocol upgrade.
- Publish packaged releases with checksums and retain the validated package inventory.
