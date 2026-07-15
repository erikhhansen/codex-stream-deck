# Development and release

## Environment

- Node.js 24+
- npm with lockfile support
- Stream Deck 7.1+
- Codex CLI for integration tests
- Python 3 for helper syntax checks and passive bridge testing

Install exactly the locked dependency graph:

```powershell
npm ci
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Watch and rebuild the plugin. |
| `npm run typecheck` | Run strict TypeScript checking. |
| `npm test` | Run unit and security-boundary tests. |
| `npm run test:integration` | Smoke-test a real local Codex app-server without a model turn. |
| `npm run build` | Bundle the plugin. |
| `npm run validate` | Validate against current Stream Deck rules. |
| `npm run validate:ci` | Validate without network-based rule updates. |
| `npm run privacy` | Scan release inputs for local user paths and token-shaped secrets. |
| `npm run security` | Run npm advisory, registry-signature, and privacy checks. |
| `npm run check` | Typecheck, test, build, and validate. |
| `npm run pack` | Build and create the installer package. |

## Test strategy

- Parser tests cover schema validation, marker extraction, age/state mapping, and secret redaction.
- Security tests cover untrusted settings, control characters, UTF-8 byte bounds, notify allow-lists, and Property Inspector CSP.
- Native-launch tests cover deep-link allow-lists.
- Project tests cover primary-task selection and descriptive titles.
- The optional integration test starts the installed Codex CLI, performs the official app-server initialization handshake, and lists tasks.

The integration test is skipped unless `RUN_CODEX_INTEGRATION=1`; the wrapper script sets that flag for `npm run test:integration`.

## CI

GitHub Actions runs on Node 24 with read-only repository permissions. It installs from `package-lock.json` with lifecycle scripts disabled, audits production dependencies, typechecks, tests, builds, validates using cached Stream Deck rules, checks Python helper syntax, and runs the release privacy scan.

Dependabot checks npm and GitHub Actions dependencies weekly.

## Versioning

Keep these versions aligned:

- `package.json` uses semantic versioning, such as `0.1.0`.
- `manifest.json` uses Stream Deck's four-part version, such as `0.1.0.0`.
- Git tags use `v<package version>`, such as `v0.1.0`.

## Release checklist

1. Review `git status` and the complete diff.
2. Run `npm ci` from the lockfile.
3. Run `npm run security`.
4. Run `npm run check`.
5. Run `npm run test:integration` on a signed-in Codex installation.
6. Run `python -m py_compile` on both notify helpers.
7. Run `npm run pack` and inspect the package inventory.
8. Install the package in Stream Deck and visually verify project labels, utility graphics, and the Property Inspector.
9. Confirm the repository contains no personal identifiers, absolute user paths, generated logs, caches, source maps, or credentials.
10. Commit, push, review CI, tag, and attach the `.streamDeckPlugin` package to the GitHub release.

## Dependency policy

Production dependencies are exact-pinned. Avoid adding production packages unless a standard-library implementation is meaningfully riskier. Review lockfile changes, npm advisories, registry signatures, transitive dependency count, and package lifecycle scripts before merging an update.
