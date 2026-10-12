# Security policy

## Report privately

Use [GitHub private vulnerability reporting](https://github.com/Open-Self/Open-Self/security/advisories/new).
Private reporting is enabled for this repository. Do not publish exploit details, personal
vaults, chat exports, backup passphrases, API tokens or OS key material in public issues.

Include the affected OpenSelf version, OS and Node version, the boundary crossed, expected
and actual behavior, and a minimal reproduction using synthetic data. Redact personal
paths and identifiers. There is no need to send a real vault to demonstrate a bug.

This is a volunteer project with best-effort triage, not a guaranteed response-time service
or bug-bounty program. Coordinate publication of details through the private report.

## Supported releases

During 0.x, the latest minor is the maintenance target. Backports to older minors are not
promised. GitHub artifacts and npm publication have separate status; use the installation
instructions in [README.md](./README.md) and check the [upgrade guide](./docs/upgrade-guide.md).
See the full [support policy](./docs/support-policy.md).

## Security scope

- Unintended disclosure of memory content, provenance, history, captured data or secrets.
- Dashboard authentication bypass or authorization bypass at the MCP boundary.
- Unsafe parsing, command execution, path traversal or injection through imported data.
- Backup integrity failures, key exposure, unsafe restore or unintended overwrite.
- Messaging actions that bypass configured consent, review or disclosure controls.

The project does not treat truthful AI disclosure as a vulnerability. Personality matching
does not authorize impersonation or bypassing the owner's consent and review controls.

## Trust boundaries

MCP permissions constrain tool calls. They do not isolate an agent with shell or filesystem
access under the owner's account. The owner-level JavaScript API also bypasses MCP policy.
See [agent permissions](./docs/agent-permissions.md) before running untrusted agents.

Vault encryption protects payload fields at rest, not the entire SQLite database. Operational
metadata remains visible, and a process running as the owner may access the OS key provider.
Portable backups require their passphrase. See [backup and recovery](./docs/backup-recovery.md).

The dashboard is a local administration surface. Keep its token private and do not expose it
as a public service. Optional cloud model calls and messaging gateways send their configured
data to the selected provider when enabled.
