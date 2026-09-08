# Upgrade guide

Before upgrading, keep a verified backup and read the intervening changelog entries.
Close applications that own the vault before testing a migration against a copy.

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
redirecting clients. Backup archives exclude policy files, access-audit records, connector
polling state and legacy messaging/personality files; preserve needed owner configuration
separately. Do not overwrite the original vault as an upgrade experiment.

When a newer release cannot open a copy, keep the original and report the exact version,
OS, Node version and redacted error. Do not upload a personal vault or keys to a public
issue. Schema downgrades and automatic destructive rollback are not supported.
