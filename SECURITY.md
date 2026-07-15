# Security policy

## Supported versions

Security fixes are provided for the latest released version.

## Report a vulnerability

Do not open a public issue for a suspected vulnerability or credential exposure. Use GitHub's **Security → Report a vulnerability** flow to submit a private report with:

- affected version and operating system
- Stream Deck and Codex versions
- impact and prerequisites
- minimal reproduction steps
- relevant redacted logs
- any suggested fix

Do not include API keys, access tokens, full task transcripts, personal paths, or other sensitive data. Replace them with stable placeholders.

You should receive an acknowledgement within seven days. A fix, disclosure plan, and credit will be coordinated through the private advisory when the report is confirmed.

## Security design

The plugin is local-first: it connects to a child Codex app-server over stdio, binds its optional notify endpoint only to `127.0.0.1`, requires a random bearer token, launches processes without a shell, rejects approvals, uses bounded parsers and persistence, and disables tool network access for plugin-owned status and task turns.

See [the full audit](docs/SECURITY-AUDIT.md) for controls, findings, residual risks, and trust assumptions.
