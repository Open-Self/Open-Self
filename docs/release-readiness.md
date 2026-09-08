# v1.0 release readiness

Audit date: 2026-09-09. Runtime baseline:
[`697f8db` / v0.13.1](https://github.com/Open-Self/Open-Self/tree/697f8db2f7e1696559472169732139ab6d11c5f9).
This is a point-in-time evidence record, not a declaration of 1.0 stability. Update the
evidence and remaining work when changes ship; a green build alone does not close every item.

## Evidence by requirement

| Requirement | Evidence | Assessment |
|---|---|---|
| Typed memory, provenance, scope, sensitivity and forgetting | [Store tests](../tests/unit/context/store.test.js), [schema tests](../tests/unit/context/schema.test.js), [policy tests](../tests/unit/context/mcp-policy.test.js) | Implemented and regression-tested at the store/MCP boundary |
| Time-aware retrieval and bounded context | [Offset regressions](../tests/unit/context/temporal-offsets.test.js), [budget regressions](../tests/unit/context/context-budget.test.js) | All retrieval modes, fallback, list and context checked; conflict-window gap remains below |
| Imports, local vectors and incremental capture | [Context tests](../tests/unit/context/), [capture recovery](../tests/unit/context/capture-recovery.test.js) | Tested with synthetic local sources, including process exit and retry |
| Authenticated local dashboard | [Server implementation](../src/context/server.js), [installed consumer](../tests/package/smoke.mjs) | Token-protected routes and real HTTP asset serving checked; not proof of a complete browser accessibility audit |
| Payload encryption and portable recovery | [Backup tests](../tests/unit/context/backup.test.js), [crypto tests](../tests/unit/context/vault-crypto.test.js) | Wrong keys, corruption, overwrite refusal, schema compatibility and checkpoint restore checked |
| Native OS key storage | [Key manager tests](../tests/unit/context/vault-key-manager.test.js), [provider implementation](../src/context/vault-key-manager.js) | Incomplete: tests inject a Map-backed provider; real OS provider roundtrips are not a CI gate |
| MCP owner policy and audit | [Policy tests](../tests/unit/context/mcp-policy.test.js), [permission guide](./agent-permissions.md) | Tool-boundary behavior checked; direct owner filesystem/shell access remains outside that boundary |
| Public API and declarations | [API reference](./api-reference.md), [export contract](../tests/contracts/exports.ts), [consumer contract](../tests/contracts/consumer.ts) | All 50 root value exports checked with positive/negative TypeScript cases; 1.x compatibility is not yet frozen |
| Upgrade and installed package | [Frozen migration fixtures](../tests/fixtures/migrations/), [package test](../scripts/test-package.js), [upgrade guide](./upgrade-guide.md) | Schema 0/1 upgrade fixtures and real tarball installation checked; freeze a schema-2 released fixture for future upgrades |
| Platform and quality gates | [Exact-commit CI](https://github.com/Open-Self/Open-Self/actions/runs/34255405632), [release verification](https://github.com/Open-Self/Open-Self/actions/runs/34255975885) | Six OS/Node combinations passed; release workflow's overall failure is the separate npm job |
| Support and private reporting | [Support policy](./support-policy.md), [security policy](../SECURITY.md), [contributing](../CONTRIBUTING.md) | Policies present; private vulnerability reporting enabled and read back via GitHub API on audit date |
| Registry publication | `npm view openself version`, repository secret names, release publish log | Incomplete: npm latest is 0.7.0; no NPM_TOKEN secret is configured |

The successful local suite contained 499 tests. Reported line coverage was 88.93%, with
the exclusions listed in [vitest.config.js](../vitest.config.js). One local run timed out
while cleaning up test files; the rerun passed with a 30-second local hook timeout. CI
passed with its unchanged default timeouts. Coverage is not a claim that every CLI,
gateway, provider or dashboard interaction has been exercised live.

## Remaining work before v1.0

1. **Correct conflict candidate selection over the full proposed interval.** The current
   implementation searches at `validFrom` (or event/current time) before checking overlap.
   A stored decision valid March 1–June 1 is omitted for a proposal valid January 1–December 1,
   even with identical scope/type and threshold zero. An in-memory reproduction returned
   zero candidates where one interval-overlap candidate was expected. Apply temporal and
   permission filters before candidate limits, then verify through store and MCP regressions.
2. **Exercise native key providers.** Add isolated synthetic-key roundtrips for Windows DPAPI,
   macOS Keychain and Linux Secret Service, with cleanup of only test-owned state. Validate
   explicit failure when the provider/session is unavailable. Mock-based backup tests remain
   useful but do not substitute for these integration checks.
3. **Preserve the released schema-2 baseline.** Freeze SQL and synthetic checkpoint state from
   a released v0.13 tag so future schema changes are checked independently of current setup code.
4. **Complete publication configuration.** A repository maintainer must provision a valid npm
   publishing credential as the Actions `NPM_TOKEN` secret (or implement and verify a replacement
   trusted-publishing flow). Do not put credentials in issues, files or chat. Rerun only the
   failed publish job for an existing verified release and confirm its exact registry version.
5. **Run the final 1.0 candidate through the complete gates.** Recheck open release blockers,
   compatibility and upgrade notes, private reporting, platform CI, artifact contents/digest,
   and actual registry publication. Current evidence proves the cited 0.x artifact, not a
   future 1.0 version. External provider mocks and local-dashboard scope must remain explicit.

No open GitHub issues were returned at audit time. That does not close the gaps above:
absence of issue reports is weaker evidence than an exercised contract.

## Verified distribution

The available Context Vault artifact is
[openself-0.13.1.tgz](https://github.com/Open-Self/Open-Self/releases/download/v0.13.1/openself-0.13.1.tgz),
from the [v0.13.1 release](https://github.com/Open-Self/Open-Self/releases/tag/v0.13.1).
Its downloaded SHA-256 was verified as:

```text
76ac2d70dc7902443268efe167f260d46aa0523d6f3922955265ef9aa0e53c1b
```

The npm publish job failed explicitly because `NPM_TOKEN` was absent. Until publication is
verified, the README directs Context Vault users to this tarball rather than the old registry
version. Publishing a GitHub release and publishing to npm are distinct outcomes.
