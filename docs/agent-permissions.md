# MCP agent permissions and local audit

OpenSelf v0.11 adds owner-configured permissions to the stdio MCP interface. Each launched
server has one fixed client identity, a set of literal scope roots, a sensitivity ceiling,
and independent `read`, `remember`, and `forget` capabilities.

## Configure a client

Create a policy file that the launching application can read but the agent cannot edit:

```json
{
  "version": 1,
  "clients": {
    "atlas-reader": {
      "scopes": ["project/atlas"],
      "maxSensitivity": "personal",
      "capabilities": ["read"]
    },
    "atlas-writer": {
      "scopes": ["project/atlas"],
      "maxSensitivity": "private",
      "capabilities": ["read", "remember", "forget"]
    }
  }
}
```

Launch a separate server for each client:

```bash
openself mcp --data-dir /absolute/vault --policy /protected/mcp-policy.json --client atlas-reader
```

An MCP host configuration can use:

```json
{
  "mcpServers": {
    "atlas-context": {
      "command": "openself",
      "args": ["mcp", "--data-dir", "/absolute/vault", "--policy", "/protected/mcp-policy.json", "--client", "atlas-reader"]
    }
  }
}
```

The owner selects `--client`; the name supplied by the MCP client's handshake is not an
identity claim. Unknown clients, malformed JSON, unsupported policy versions, unknown
fields, empty scope lists, and incomplete `--policy`/`--client` pairs fail startup before
opening the vault. Permissions are validated and copied at startup. Restart the server
after changing policy; an existing process does not hot-reload or accept policy edits
through its tools.

## Enforcement rules

- A root includes itself and descendants separated by `/`. `project/atlas` does not
  include `project/atlasx`, `project/Atlas`, or `project`. Scope matching is case-sensitive;
  `%` and `_` are literal characters, not SQL wildcards. Scope names are logical labels,
  not filesystem paths.
- Omitting scope searches the union of permitted roots. An explicit scope must fall
  within one permitted root. Filtering happens before candidate limits and ranking for
  lexical, vector, hybrid, and punctuation-only fallback retrieval.
- The effective read ceiling is the lower of the owner's ceiling and the tool request.
  A caller can narrow it but cannot raise it. Context and conflict responses use the
  same boundary, including conflict warnings returned from `remember`.
- `read` grants search, bounded context, and conflict review. `remember` grants storage
  only inside allowed scopes and at or below the ceiling. With no `read` capability,
  remember returns the caller's newly stored memory and no existing conflict records.
- `forget` grants soft deletion only for active records inside allowed scopes and below
  the ceiling. Missing and unauthorized IDs return the same policy-denied response.
  The check and mutation share a SQLite write transaction.
- Capabilities may be an empty list to deny all five tools. Tools remain discoverable,
  but unauthorized calls return an MCP tool error. There is no tool for changing policy.

Without a policy file, `openself mcp` uses the **trusted-local** identity: all scopes,
all three capabilities, and a fixed `private` ceiling. This mode is for a trusted local
host, not isolation between agents. Compared with v0.10, requesting `restricted` alone
no longer grants access. Configure an explicit owner policy with a `restricted` ceiling
when that access is intentional. Existing CLI, dashboard, and direct `ContextStore`
operations remain owner administration surfaces outside the MCP policy.

## Access audit

MCP records locally in `mcp-audit.db` beside `context.db`. Each schema-valid call to a
registered tool stores only:

| Field | Meaning |
|---|---|
| `id` | Local event sequence |
| `occurredAt` | UTC attempt timestamp |
| `client` | Owner-configured alias |
| `tool` | Registered tool name |
| `outcome` | `attempted`, `allowed`, `denied`, or `error` |

It does not store query text, memory content, memory IDs, scopes, passphrases, raw errors,
client-handshake names, or response payloads. Unknown tools and requests rejected by
MCP schema validation do not reach the audited handler.

A durable `attempted` event is written before access checks or memory operations. If
that write fails, the tool does not run. Memory writes roll back if terminal audit
recording fails. A crash may leave `attempted` records. `allowed` indicates that the
policy check and handler succeeded; it is not a transaction commit receipt, proof of
response delivery, or a tamper-evident log. Both databases remain owned by the local user.

```bash
openself audit list --data-dir /absolute/vault --client atlas-reader --limit 50
openself audit prune --data-dir /absolute/vault --retention-days 7 --max-entries 5000
openself audit clear --data-dir /absolute/vault
```

Defaults retain 30 days and at most 10,000 records. Age/count pruning happens on tool
attempts and audit listing; there is no background timer. Set
`--audit-retention-days` and `--audit-max-entries` on the MCP launch command to change
the ongoing policy. The audit CLI accepts `--retention-days` and `--max-entries` for its
operation. All processes sharing an audit database should use the same retention policy;
a process with shorter retention can prune events written by another client.

`clear` removes all logical audit entries. It does not promise forensic erasure from
filesystem snapshots or old WAL copies. Protect the data directory with OS permissions.
The audit is not payload-encrypted, but its fields deliberately exclude memory data.

## Trust boundary and recovery

This is authorization at the MCP tool boundary, not a sandbox for the entire OS account.
An agent that can edit the launch command or policy file, invoke owner CLI commands, or
read the vault directly can bypass it. Use filesystem/process isolation when an agent
has shell or file tools. Do not expose stdio through an unauthenticated network bridge.

Policy files and `mcp-audit.db` are **not** part of the portable Context Vault backup.
Back up owner configuration separately, and deliberately reapply the desired policy
when connecting agents to a restored vault. Existing memory versions remain in the
vault backup; access-audit retention is independent of memory retention.

## JavaScript hosts

```js
import { ContextStore, createContextMcpServer, loadMcpPolicy } from 'openself';

const store = new ContextStore({ dataDir: '/absolute/vault' });
const server = createContextMcpServer(store, {
    policy: loadMcpPolicy('/protected/mcp-policy.json', 'atlas-reader'),
    auditRetentionDays: 30,
    auditMaxEntries: 10000,
});
// Connect your MCP transport. During shutdown:
await server.close(); // closes the audit database created by this server
store.close();
```

In-memory vaults get in-memory audit logs. A host can supply an `AccessAudit` instance
through `options.audit`; it then owns and closes that instance itself. Hosts supplying
the policy directly must include `clientId` plus the three fields in a client entry.
