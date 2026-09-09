# Project Roadmap

OpenSelf is a local-first Personal Context Vault for AI agents. Delivery is phased:
implement the capability, verify its behavior, then release it with migration notes.
See [CHANGELOG.md](../CHANGELOG.md) for implementation history and
[GitHub Releases](https://github.com/Open-Self/Open-Self/releases) for published artifacts.
A changelog entry alone is not evidence of publication to npm.

## Phase 1: Context foundation — implemented in v0.8.0

- Typed memory, provenance, hierarchical scopes, temporal validity, and sensitivity filtering.
- SQLite/FTS5 storage, recoverable forgetting, bounded context construction.
- CLI, JavaScript API, and stdio MCP integration.
- Existing personality and messaging workflows remain available.

## Phase 2: Usable private vault — v0.9.0

- Markdown/text and chat imports with durable deduplication.
- Local hybrid retrieval and potential conflict detection.
- Authenticated localhost dashboard with editing, merging, and version history.
- Incremental project, calendar, email, and browser export capture.
- AES-256-GCM payload encryption, blind lexical indexes, and OS-bound key storage.
- Versioned retrieval, temporal, sensitivity, and provenance evaluations.
- Linux, Windows, and macOS verification on Node 22.13 and 24.
- Tag releases gated by CI, with a downloadable npm tarball and separate npm publication.

Node 20 users must upgrade to Node >=22.13 before installing v0.9.0. Existing local
vaults are opened in place; enabling encryption remains an explicit user action.
Payload encryption does not hide scope, timestamps, IDs, or other operational metadata.

## Phase 3: Recovery and portability - v0.10.0

Implemented, with [recovery documentation](./backup-recovery.md):

- Consistent backup while a vault is open, including version history and import ledgers.
- Encrypted portable backup with explicit key recovery; no silent plaintext exports.
- Restore validation, schema compatibility checks, and refusal to overwrite an existing vault.
- Tests for interrupted writes, corrupted backups, wrong keys, and restored retrieval behavior.
- CLI recovery guide and a release with an end-to-end backup/restore example.

Portable recovery requires the encrypted archive and its passphrase. The destination
requires an available OS key provider. Archives are capped at 256 MiB and exclude
legacy JSON connector state and legacy application files; v0.13+ SQLite checkpoints are
included. Copying SQLite alone is not
a portable encrypted backup.

## Phase 4: Agent permissions and accountability - v0.11.0

- Owner-configured scope and sensitivity ceilings that agents cannot raise themselves.
- Explicit read/write capabilities per MCP client configuration.
- Local access audit with retention controls and no unnecessary payload duplication.
- Adversarial permission tests and documented trust boundaries.

Implemented at the MCP tool boundary, with [policy and audit documentation](./agent-permissions.md).
A process with direct filesystem or shell access under the owner account can bypass this boundary;
OS isolation is still required for untrusted agents. Policy changes require a server restart.

## Phase 5: Stable public API — v1.0

- Document supported JavaScript exports, errors, schemas, and compatibility guarantees.
- Ship declarations or equivalent checked API documentation for library consumers.
- Migration fixtures from released vault schemas and installed-package integration tests.
- Recovery, permission, retrieval, and packaging gates pass on all supported platforms.
- Publish a support policy and an upgrade guide; resolve release-blocking issues.

v1.0 is a quality gate, not a date promise. Community adoption and download counts are
not substitutes for correctness or evidence of a successful release.

### v0.12 compatibility candidate

Delivered declaration coverage for every root export, strict consumer type checks,
frozen released-schema migration fixtures, and isolated installed-package tests.
The [API reference](./api-reference.md), [support policy](./support-policy.md), and
[upgrade guide](./upgrade-guide.md) define the candidate surface and its boundaries.

Before v1.0: review remaining release-blocking issues against these contracts, verify
the final version through all release gates, and complete registry publication.
The [release-readiness audit](./release-readiness.md) tracks evidence and concrete gaps.

The 1.0 release retains RC.2's API and schema 2, declares the documented 1.x compatibility
policy, and updates the dependency graph to resolve the candidate's later audit findings.
Final CI, GitHub artifact and npm `latest` results are recorded in the readiness audit after
verification; a version bump alone does not establish successful distribution.

### v0.13 capture recovery

Capture checkpoints now share a SQLite transaction with memories and indexes. Process-exit
regressions verify rollback and retry, per-file savepoints preserve project scan isolation,
and backup tests verify checkpoint recovery and schema-1 compatibility. Legacy JSON checkpoint
import and the schema-2 upgrade are documented in the upgrade guide.

### Native key-provider release gate

The shared CI workflow now exercises actual DPAPI, Keychain and Secret Service providers
with synthetic keys on both supported Node versions. It verifies fresh-process reopening
and refusal on missing keys or unavailable provider commands. See the
[native verification guide](./native-key-verification.md) for isolation and test limits.

## Release process

Release candidates such as `v1.0.0-rc.1` run the same gates as stable releases. They are
marked as GitHub prereleases without replacing Latest and use the opt-in npm `next` tag.
Versions without a prerelease suffix use npm `latest`. Exact tag/manifest agreement and
canonical versions without build metadata are required before packaging.

1. Finish the phase with task-relevant source, tests, and documentation.
2. Update the manifest and lockfile version, plus dated changelog and migration notes.
3. Run lint, formatting, tests with coverage, context evaluations, and strict publint.
4. Inspect `npm pack --dry-run` for expected content and absence of private runtime data.
5. Commit with a conventional message, push, and verify CI for that exact commit.
6. Push the matching `vX.Y.Z` tag. Release CI repeats the platform matrix, checks the
   tag against the manifest, packages the source, and creates a GitHub release.
7. The publish job uploads that same tarball to npm with provenance using OIDC. npm must
   trust `Open-Self/Open-Self` workflow `release.yml` with direct publish permission.
8. Verify both the GitHub artifact and the npm version. If npm authentication fails,
   correct the trusted publisher configuration and rerun the failed publish job; do not move
   the release tag. For tags with the old token workflow, use the verified-artifact recovery
   dispatch described in [CONTRIBUTING.md](../CONTRIBUTING.md#maintainer-releases).

CLI and MCP versions are read from `package.json`. Before v1.0, breaking changes must
have prominent migration notes. Stable 1.x releases will preserve documented contracts;
breaking changes require a new major version.

## Contribution priorities

Recovery tooling, permission boundaries, realistic retrieval evaluations, reproducible
bug reports, accessibility, and documentation are welcome. See
[CONTRIBUTING.md](../CONTRIBUTING.md) and [SECURITY.md](../SECURITY.md).

## Project boundaries

- MIT licensed and local-first; no mandatory cloud service or automatic cloud sync.
- No telemetry, tracking, or training on user data.
- Cloud model integrations are optional and send supplied context to that provider.
- Human approval and explicit consent guide action-oriented integrations.
- The Context Vault dashboard stays a local administration interface.
