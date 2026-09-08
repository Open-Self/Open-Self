# JavaScript and TypeScript API

OpenSelf is ESM-only. Install it in a Node.js project and import from `openself`.
Version 0.12 includes declarations for all 50 existing root value exports; runtime
validation remains necessary because TypeScript cannot enforce lengths, UUIDs, date
ordering, sensitivity policy, or filesystem availability.

```ts
import { ContextStore, type MemoryInput, type SearchMemory } from 'openself';

const input: MemoryInput = {
    type: 'decision',
    content: 'Use SQLite for project state',
    scope: 'project/atlas',
    sensitivity: 'private',
    source: { kind: 'document', locator: 'architecture.md' },
};
const store = new ContextStore({ dataDir: './data' });
try {
    const memory = store.remember(input);
    const matches: SearchMemory[] = store.search('database decision', {
        scope: 'project/atlas', maxSensitivity: 'private',
    });
    console.log(memory.id, matches[0]?.relevance);
} finally {
    store.close();
}
```

The declarations are checked with the pinned TypeScript compiler in the lockfile, strict
null checks, and both NodeNext and Bundler resolution in an installed consumer. Bundler
resolution support is for TypeScript tooling; the runtime uses Node APIs and native
SQLite and is **not a browser bundle**. JavaScript consumers need no compile step.

## ContextStore contract

Construction opens the SQLite database and applies supported migrations. `dataDir`
defaults to `./data`; `dbPath` can override it or be `:memory:`. A Buffer opens an in-memory
SQLite image (use a rollback-mode image; raw WAL images cannot be deserialized by SQLite).
`encryptionKey` accepts a 32-byte Buffer or a base64/hex key. Otherwise the environment
key or configured OS key provider is used. See [recovery](./backup-recovery.md).

Methods are synchronous except the separate backup/MCP functions. Treat the store as
owner-level access: direct calls do not inherit an MCP client's authorization policy.

| Method | Result and absence behavior |
|---|---|
| `remember(input)` | Normalized record with generated ID when omitted |
| `rememberOnce(input, dedupeKey)` | `{ memory, created }`; repeated keys reuse the existing record, including forgotten records |
| `get(id, { includeForgotten? })` | Record or `null`; forgotten records excluded by default |
| `update(id, changes)` | Updated active record or `null`; changes create a history entry |
| `history(id)` | Newest-first version snapshots; `[]` for unknown IDs |
| `merge(primaryId, duplicateIds, changes?)` | `{ memory, mergedIds }`; throws for missing active records or self-merge |
| `forget(id)` | `true` for the first successful soft-delete, `false` for missing/already-forgotten records |
| `search(query, options?)` | Ranked active records; empty query returns `[]` |
| `list(options?)` | Records ordered by event/creation time with pagination, without relevance ranking |
| `findPotentialConflicts(input, options?)` | Similar current facts/preferences/decisions; punctuation-only proposals return `[]` |
| `buildContext(query, options?)` | `{ query, context, memories, usedChars }` with a bounded context string |
| `stats()` | Counts by status/type, vector model/count, encryption mode, and database path |
| `close()` | Releases the SQLite handle; do not use the store afterwards |

`MemoryInput` requires `content`. Type defaults to `note`, scope to `personal`, sensitivity
to `personal`, confidence to 1, and tags to an empty array. Source fields are normalized
with defaults. Validation is performed by the exported Zod `memoryInputSchema`;
`normalizeMemory(input, now?)` additionally supplies identity/lifecycle fields and validates
temporal ordering without writing to storage.

Stored date fields can be absent on freshly normalized objects and `null` when read
from SQLite. `forgottenAt` is optional/nullable. Retrieval results have optional `match`
and `relevance`: punctuation-only fallback results are ordinary listed records and do
not claim a vector/lexical rank. Callers must narrow optional fields and missing records.

Search accepts scope, allowed-scope roots, type, sensitivity, as-of time, retrieval mode,
and limits. Owner-level default sensitivity is `restricted`; MCP applies its separate
owner-configured ceiling. Literal scope matching is case-sensitive and hierarchical.
List only applies sensitivity/time filters when those options are provided. Filters,
ranking, and character budgets are described in [Context Vault](./context-vault.md).
Ranking scores are relative heuristics, not calibrated probabilities or stable ordering
across model/version changes. Do not persist them as identifiers.

## Other Context Vault exports

| Exports | Supported use |
|---|---|
| `ContextImporter`, `detectImportFormat`, `chunkDocument` | Synchronous document/chat ingestion and dry-run reports; imports can partially succeed and report errors |
| `LocalVectorEncoder`, `cosineSimilarity` | Deterministic local numeric vectors and similarity |
| `ProjectFolderCapture`, `RecordCapture` | One-shot incremental scans; callers own polling and lifecycle |
| `parseCalendarSource`, `parseEmailSource`, `parseBrowserSource` | Produce source-keyed memory candidates; supply scope, sensitivity and limit |
| `createContextServer` | Returns Express app, token, host/port metadata, store, and close; **does not start listening** |
| `createContextMcpServer`, `runContextMcpServer`, `loadMcpPolicy` | MCP factory/stdio startup and owner policy loading |
| `AccessAudit` | Local metadata audit begin/finish/list/prune/clear/close |
| `VaultCodec`, `PlaintextCodec`, `normalizeKey` | Payload codecs and key normalization; not a full-database encryption API |
| `VaultKeyManager`, `loadConfiguredVaultKey` | OS-bound key configuration and status |
| `backupVault`, `restoreVault` | Promise-returning portable backup and restore to a new directory |
| `evaluateContextVault` | Deterministic report of retrieval, temporal, privacy and provenance metrics |

`ProjectFolderCapture.scan()` reports per-file `{ file, message }` errors; import reports
use message strings. Record parsers can throw on malformed/unavailable sources. Inspect
report counters and errors rather than assuming a resolved call means every source was
imported. An injected evaluation store is modified by the evaluation dataset.

Factories close only resources they own. `createContextServer().close()` closes an owned
store, not an HTTP listener created by the caller. Close that listener separately.
`createContextMcpServer().close()` closes its internally created audit database; the
caller still owns the supplied store and any explicitly supplied audit object.
`runContextMcpServer()` returns both handles; close both when your host shuts down.

## Existing personality and messaging exports

These exports remain available with declarations, but remain separate from Context Vault:

| Exports | Purpose |
|---|---|
| `parseWhatsApp`, `parseTelegram`, `parseGeneric`, `splitBySender`, `detectUserName` | Chat parsing and conversation grouping |
| `extractPersonality`, `createFingerprint`, `generateSoulMd`, `saveSoulMd`, `loadSoul` | Personality analysis and local profile generation/loading |
| `loadConfig`, `createProvider`, `autoDetectProvider`, `CloneBrain` | YAML/environment configuration and model generation |
| `HumanMimicry`, `SafetyGuard`, `ReviewQueue` | Reply processing and human review |
| `CloneArena`, `GhostMode` | Debate and presence workflows |
| `ChatMemory`, `createEmbedding` | Legacy chat-history retrieval |
| `generateBadge`, `DiscordGateway`, `WhatsAppGateway` | Badge rendering and messaging adapters |

Arbitrary YAML extension fields and schema-free review items are typed as
`Record<string, unknown>`, not unchecked `any`. Model/gateway constructors may require
credentials; live provider availability is not established by credential-free unit tests.
Follow the existing consent and disclosure guidance before enabling messaging.

## Errors and compatibility

- Invalid memory input throws Zod validation errors. Use `safeParse` when validation
  should produce a result rather than an exception.
- Storage, filesystem, key-provider and invalid-operation errors throw/reject `Error`.
  Exact error messages are not a stable programmatic interface; error codes from Node
  or SQLite are owned by those dependencies.
- MCP policy denial returns an MCP tool result with `isError: true`; malformed requests
  can be rejected by SDK schema validation before a handler runs. See [permissions](./agent-permissions.md).
- Do not assume successful audit recording proves a response was delivered. A transport
  error is distinct from a memory operation's outcome.

The supported package entrypoints are `openself`, `openself/package.json`, and the
executable `openself/cli`. Importing the CLI entrypoint executes it; it has no library
exports. Deep `src/` imports, underscored helpers, SQLite tables, and direct `store.db`
mutation are implementation details outside the prospective stable contract.

v0.12 is a compatibility candidate, not a declaration that 1.x is frozen. See
[support and compatibility](./support-policy.md) and the [upgrade guide](./upgrade-guide.md).
