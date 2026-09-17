# OpenSelf Context Exchange Format v1

**Status:** Stable
**Format identifier:** `openself-context`
**Version:** `1`
**Media type (suggested):** `application/x-openself-context+jsonl`

The OpenSelf Context Exchange Format is a portable, plaintext JSONL
representation of Context Vault memories. It lets owners move context between
OpenSelf installations, feed context to other tools, and archive context in
version control — without access to the originating SQLite vault or its keys.

> This is an *exchange* format, not a backup format. It is plaintext by design.
> For disaster recovery use `openself backup`, which produces an encrypted
> `.osbackup` archive.

## 1. File structure

A conforming file is UTF-8 JSONL:

- **Line 1** — exactly one *header record*.
- **Lines 2..n** — zero or more *memory records*, one JSON object per line.
- Blank lines are ignored. Lines MUST NOT be pretty-printed.
- Lines MUST be separated by `\n` or `\r\n`.

### 1.1 Header record

```json
{"format":"openself-context","version":1,"exportedAt":"2025-01-15T10:30:00.000Z","generator":"openself 1.1.0","scope":null,"includeRestricted":false,"count":2}
```

| Field               | Type           | Required | Description                                                |
| ------------------- | -------------- | -------- | ---------------------------------------------------------- |
| `format`            | string         | yes      | MUST be `"openself-context"`.                              |
| `version`           | integer        | yes      | MUST be `1`. Parsers MUST reject other versions.           |
| `exportedAt`        | string (RFC3339/ISO-8601 UTC) | yes | When the export was produced.                 |
| `generator`         | string         | no       | Producing tool and version, e.g. `"openself 1.1.0"`.       |
| `scope`             | string \| null | yes      | Scope filter applied at export time; `null` = unfiltered.  |
| `includeRestricted` | boolean        | yes      | Whether `restricted` memories were eligible for export.    |
| `count`             | integer        | yes      | Number of memory records that follow.                      |

### 1.2 Memory record

```json
{"id":"3d2b1f0e-…","type":"fact","content":"Deploys run through GitHub Actions","contentHash":"a1b2…","summary":"deploy pipeline","source":{"kind":"manual","locator":"","title":""},"scope":"project/openself","sensitivity":"personal","sourceTrust":"owner","confidence":1,"validFrom":null,"validTo":null,"occurredAt":null,"tags":["ci"],"createdAt":"2025-01-10T09:00:00.000Z","updatedAt":"2025-01-10T09:00:00.000Z"}
```

| Field          | Type              | Required | Description                                              |
| -------------- | ----------------- | -------- | -------------------------------------------------------- |
| `id`           | string (UUID)     | yes      | Original memory id. Not guaranteed unique across vaults. |
| `type`         | enum              | yes      | One of `fact`, `preference`, `decision`, `commitment`, `relationship`, `event`, `note`. |
| `content`      | string (1–20000)  | yes      | The memory text.                                         |
| `contentHash`  | string (64 hex)   | yes      | SHA-256 content address — see §3.                        |
| `summary`      | string (≤500)     | yes      | Short label; may be `""`.                                |
| `source`       | object            | yes      | `{kind, locator, title}` provenance triple.              |
| `scope`        | string (1–200)    | yes      | Slash-delimited context scope, e.g. `project/openself`.  |
| `sensitivity`  | enum              | yes      | `public`, `personal`, `private`, or `restricted`.        |
| `sourceTrust`  | enum              | yes      | `untrusted`, `external`, `trusted`, `verified`, `owner`. |
| `confidence`   | number (0–1)      | yes      | Confidence weight for retrieval ranking.                 |
| `validFrom`    | string \| null    | yes      | ISO-8601 start of temporal validity, or `null`.          |
| `validTo`      | string \| null    | yes      | ISO-8601 end of temporal validity, or `null`.            |
| `occurredAt`   | string \| null    | yes      | ISO-8601 event time for `event` memories, or `null`.     |
| `tags`         | string[] (≤50)    | yes      | Lowercase tags.                                          |
| `createdAt`    | string (ISO-8601) | yes      | Original creation time.                                  |
| `updatedAt`    | string (ISO-8601) | yes      | Last modification time in the source vault.              |

Unknown fields SHOULD be ignored by parsers so future minor extensions stay
readable by v1 tooling.

## 2. Trust semantics on import

`sourceTrust` describes provenance in the *source* vault. An import MUST NOT
be able to claim owner authorship. OpenSelf clamps imported trust to at most
`external`:

```
importedTrust = min(sourceTrust, external)
```

Importers that do not implement the trust ladder SHOULD treat all imported
records as untrusted external data.

## 3. `contentHash`

`contentHash` is a stable content address:

```
contentHash = sha256("openself-memory-v1\n" + utf8(content))
```

The `openself-memory-v1\n` prefix is a domain-separation label. Identical
content produces the identical hash in any vault, which makes `contentHash`
the portability-level dedupe key: OpenSelf re-imports skip memories whose
content hash already exists, even if the incoming `id` differs.

Consumers SHOULD recompute `contentHash` and treat a mismatch as a corrupt
record.

## 4. Idempotent import

Importing the same export twice is safe. OpenSelf dedupes on:

1. The deterministic dedupe key `openself-export:<id>`, and
2. `contentHash`, so renamed/re-id'd duplicates collapse.

A second import reports `duplicates` for every record and creates nothing.

## 5. Sensitivity and scope

- Exports exclude `restricted` memories unless produced with
  `includeRestricted: true`.
- `scope` is an opaque slash-delimited string. Consumers MUST treat it as a
  label, not a path, and MUST NOT interpolate it into filesystem or query
  contexts without sanitization.
- `sensitivity` is a disclosure label; enforcement is the consumer's
  responsibility. `restricted` content SHOULD NOT be sent to remote models.

## 6. Validation

A normative JSON Schema for both record types lives at
[`context-exchange.schema.json`](./context-exchange.schema.json).
`openself memory import` validates on ingest; third parties can validate with
any JSON Schema implementation or with
`parseContextExport()` / `validateContextExport()` from `openself`.

## 7. Compatibility

- New minor fields may be added in place; parsers MUST ignore unknown fields.
- Any breaking change increments `version`; parsers MUST reject unknown
  versions rather than guessing.
