# Upgrade guide

Before upgrading, keep a verified backup and read the intervening changelog entries.
Close applications that own the vault before testing a migration against a copy.

## From v0.13.2 to v1.0.0-rc.1

This opt-in candidate keeps the same runtime API, 50 root value exports, Node >=22.13.0
requirement and SQLite schema 2. No additional data migration is introduced. It adds real
OS key-provider release checks and separate prerelease distribution channels. Test against
a copied vault or restore into a separate directory before using it with your primary vault.
Earlier upgrades still require the migration notes below.

The candidate is not the stable 1.0 compatibility promise. Its GitHub release is marked
prerelease; npm uses `next` only when publication succeeds. Do not infer registry availability
from the version number or a GitHub asset. See the [readiness audit](./release-readiness.md).

## From v0.13.1 to v0.13.2

Conflict detection now considers the full proposed validity interval, so future or historical
overlaps can appear even when the stored memory is not valid at the proposal's start time.
Missing bounds are unbounded; `occurredAt` is event metadata, not a validity boundary.
Scope/policy filters, excluded IDs and identical content no longer consume the conflict
candidate budget. Ordinary `search`/`list` as-of behavior, schema 2 and public exports remain
unchanged. Conflict scores are still heuristic; see the candidate limits in the Context Vault guide.

## From v0.13.0 to v0.13.1

Temporal validation, retrieval and sorting now compare instants instead of ISO strings.
Results can change for memories using non-UTC offsets or different fractional-second
spellings: valid intervals previously rejected are accepted, and chronologically reversed
intervals previously accepted are rejected on new writes or updates. Existing records and
history are not rewritten. Correct an existing reversed interval by updating its date fields.
`asOf` now requires a valid ISO datetime with an explicit timezone; informal date strings
and timezone-free values are rejected. Precision is milliseconds, with inclusive bounds.
This patch keeps schema 2 and the same public exports.

## From v0.12 to v0.13

Opening a vault migrates it to SQLite schema 2, adding transactional capture checkpoints.
Older OpenSelf versions cannot reopen schema 2; use a pre-upgrade backup for rollback.
Restore continues to accept schema-1 backups, validates them before migration, and restores
them into a new encrypted vault.

Capture no longer writes JSON checkpoint files. `statePath` remains the legacy import path
and an optional capture identity, not an output file. Preserve existing checkpoint JSON until
the first successful scan imports it. Later scans prefer SQLite and leave the old file untouched.
Malformed/incompatible checkpoints now stop scans instead of silently importing duplicates.
In-memory stores keep checkpoints only in memory. Code monitoring checkpoint JSON should
consume `scan()` reports instead. See [capture lifecycle](./context-vault.md) for transaction,
partial-file failure and source-path semantics.

## From v0.12.0 to v0.12.1

Context building now enforces the complete rendered character budget, including the first
record and separators. A record too large to fit is skipped and later candidates are still
considered. This can yield fewer records or an empty block; callers must handle that case.
Increase `maxChars` within the supported range or fetch an individual record when needed.
`usedChars` now exactly equals `context.length`. No data is modified or truncated by retrieval,
and this patch does not change the database schema or public exports.

## From v0.11 to v0.12

No public root value export is removed. TypeScript declarations are now shipped and
resolved through the package export map. Type errors can reveal existing invalid calls
that were previously accepted as `any`: missing content, invalid sensitivity/capability
names, and failure to handle missing records or optional retrieval metadata.

JavaScript behavior remains compatible, with one correction: punctuation-only conflict
proposals return an empty array rather than attempting to read absent vector metadata.
No SQLite schema change is introduced by this release.

```bash
npm install openself@0.12.0
```

This command requires that the version has been published to npm. If only the GitHub
release is available, download its `openself-0.12.0.tgz` asset, verify its published
SHA-256 digest, and install the local tarball instead:

```bash
npm install ./openself-0.12.0.tgz
```

Do not rely on a repository checkout's dev dependencies to supply consumer types. The
package includes the type dependencies needed by its declarations. `typescript` itself
is a development dependency and is not required to run OpenSelf.

## From v0.9/v0.10

Node >=22.13 is required. v0.10 introduced portable passphrase-protected backups and
schema version 1; opening older supported vaults upgrades them locally. v0.11 introduced
owner MCP policies and minimal access auditing.

A tool request for `restricted` sensitivity no longer grants access by itself. Configure
an explicit owner policy and start MCP with both `--policy` and `--client` when restricted
access or per-agent isolation is intended. See [Agent permissions](./agent-permissions.md).

The compatibility suite checks frozen schema version 0 (v0.9.1) and schema version 1
(v0.11.0), including IDs, forgotten state, version history and import deduplication.
Future schema versions are refused. These tests do not authorize downgrading a newer
vault to an older application version.

## Recovery and rollback

Use the [backup/recovery guide](./backup-recovery.md) for passphrase recovery and OS-bound
key requirements. Restore to a new directory, then verify representative memories before
redirecting clients. Backup archives exclude policy files, access-audit records, legacy JSON
connector state and messaging/personality files; preserve needed owner configuration
separately. Do not overwrite the original vault as an upgrade experiment.

When a newer release cannot open a copy, keep the original and report the exact version,
OS, Node version and redacted error. Do not upload a personal vault or keys to a public
issue. Schema downgrades and automatic destructive rollback are not supported.
