# v1.0 release readiness

Audit date: 2026-09-09. Runtime baseline:
[`3c22e07` / v0.13.2](https://github.com/Open-Self/Open-Self/tree/3c22e074b6284914312550197fdb63bfb89643f8).
This is a point-in-time evidence record, not a declaration of 1.0 stability. Update the
evidence and remaining work when changes ship; a green build alone does not close every item.

## Stable 1.0 preparation

The 1.0 manifest retains the RC.2 API and schema 2. The lockfile now resolves Vitest and
coverage-v8 4.1.11, Hono 4.13.7 and Sharp 0.35.4; local npm audit reports zero vulnerabilities.
These updates address the later RC.2 audit findings recorded below. The API reference,
support policy and upgrade guide define the stable 1.x contract. Full stable-version CI,
artifact and registry evidence will be recorded after verification.

## Current npm publication status

On 2026-09-09, [OIDC recovery run 34305803185](https://github.com/Open-Self/Open-Self/actions/runs/34305803185)
successfully published the existing RC.2 artifact using npm Trusted Publishing, without an
`NPM_TOKEN` secret. `npm view openself dist-tags` returned `next: 1.0.0-rc.2` and
`latest: 0.7.0`. The exact RC.2 registry metadata includes a provenance attestation. The
tarball downloaded directly from npm has SHA-256
`b2c4bea0758360f08b966cb416d73e8b25995b9c6119eb43205b0ebdb77ed838`, identical to the verified
GitHub RC.2 artifact. The token failures below are historical and superseded by this result.

The concurrent [main CI audit](https://github.com/Open-Self/Open-Self/actions/runs/34305794286)
reported five dependency vulnerabilities (four moderate, one high), involving Vitest/mocker,
Hono and Sharp. This later audit supersedes earlier clean audit results. Resolve these findings
and rerun the complete gates before stable 1.0; OIDC publication success does not close that gate.

## v1.0.0-rc.1 candidate

The first 1.0 release candidate retains the v0.13.2 runtime contracts and schema 2, adds the
native-provider gate to release verification, and separates prerelease distribution from
stable channels. Local verification passed 527 tests in 56 files with 88.95% line coverage;
the same coverage exclusions and local timeout qualification below apply. The 16 additional
tests cover release-channel selection, rejected tags/versions and Actions output generation.

Candidate commit [`c4698c5`](https://github.com/Open-Self/Open-Self/tree/c4698c5619713f2202dae89b969afc17bbb83c45)
passed all six jobs in [branch CI](https://github.com/Open-Self/Open-Self/actions/runs/34262282291).
The [tag workflow](https://github.com/Open-Self/Open-Self/actions/runs/34262782179) repeated
all six successfully and packaged the artifact. GitHub reports the release as a prerelease;
its Latest release remains v0.13.2. The npm job received `NPM_TAG=next` but failed because
`NPM_TOKEN` was absent. Registry dist-tags still contained only `latest: 0.7.0` when checked.
Private vulnerability reporting was enabled and no open issues were returned at this audit.

The downloaded [candidate artifact](https://github.com/Open-Self/Open-Self/releases/download/v1.0.0-rc.1/openself-1.0.0-rc.1.tgz)
contains version `1.0.0-rc.1`; its 104 archive entries were checked for runtime data, databases,
credentials and generated directories. Its SHA-256 matches the GitHub asset digest:

```text
3790661d97437e5f8f959a0f1e0feb12d9b51167070d3671bd61aca518d9120c
```

This candidate was superseded by RC.2 below; the README now links the corrected candidate.
At that point registry publication and the final stable-version gates remained open. A candidate does not
close the stable 1.0 gate; external provider mocks and dashboard audit limits still apply.

## Dashboard date correction for v1.0.0-rc.2

Real Chromium tests reproduced two RC.1 defects: saving content truncated date fields to
minutes, and clearing a date retained the previous stored value. The correction preserves
unchanged timestamps and sends explicit nulls for cleared dates. All 12 local browser cases
pass across UTC, Ho Chi Minh City and New York, including the later repeated DST instant.
See [browser regressions](../tests/browser/dashboard.spec.js) and the
[upgrade notes](./upgrade-guide.md#from-v100-rc1-to-v100-rc2). The new browser job is required
alongside the six platform jobs.

Commit [`735e426`](https://github.com/Open-Self/Open-Self/tree/735e4269e3cf184e4f07834243f3e3f3873bad4a)
passed all seven jobs in [branch CI](https://github.com/Open-Self/Open-Self/actions/runs/34264369673)
and again in [release verification](https://github.com/Open-Self/Open-Self/actions/runs/34265417469).
The local suite also passed 527 Vitest tests, 12 Chromium tests, the installed consumer,
declaration/lint/format checks, context evaluations, strict publint and dependency audit.
Line coverage remains 88.95%; browser tests run separately and are not included in that metric.

The downloaded [RC.2 artifact](https://github.com/Open-Self/Open-Self/releases/download/v1.0.0-rc.2/openself-1.0.0-rc.2.tgz)
contains version `1.0.0-rc.2` and the dashboard correction. Its 104 entries were checked for
runtime/generated files and its SHA-256 matches the release asset digest:

```text
b2c4bea0758360f08b966cb416d73e8b25995b9c6119eb43205b0ebdb77ed838
```

GitHub confirms RC.2 is a prerelease and Latest remains v0.13.2. The separate npm job received
`NPM_TAG=next` and failed for missing `NPM_TOKEN`; registry dist-tags still list only v0.7.0
as latest. Stable 1.0 and successful registry publication remain unverified.

## Evidence by requirement

| Requirement | Evidence | Assessment |
|---|---|---|
| Typed memory, provenance, scope, sensitivity and forgetting | [Store tests](../tests/unit/context/store.test.js), [schema tests](../tests/unit/context/schema.test.js), [policy tests](../tests/unit/context/mcp-policy.test.js) | Implemented and regression-tested at the store/MCP boundary |
| Time-aware retrieval and bounded context | [Offset regressions](../tests/unit/context/temporal-offsets.test.js), [budget regressions](../tests/unit/context/context-budget.test.js) | All retrieval modes, fallback, list and context checked; conflict-window correction tracked below |
| Imports, local vectors and incremental capture | [Context tests](../tests/unit/context/), [capture recovery](../tests/unit/context/capture-recovery.test.js) | Tested with synthetic local sources, including process exit and retry |
| Authenticated local dashboard | [Server implementation](../src/context/server.js), [installed consumer](../tests/package/smoke.mjs) | Token-protected routes and real HTTP asset serving checked; not proof of a complete browser accessibility audit |
| Payload encryption and portable recovery | [Backup tests](../tests/unit/context/backup.test.js), [crypto tests](../tests/unit/context/vault-crypto.test.js) | Wrong keys, corruption, overwrite refusal, schema compatibility and checkpoint restore checked |
| Native OS key storage | [Native key gate](../scripts/test-native-key.js), [native CI results](https://github.com/Open-Self/Open-Self/actions/runs/34260595279), [verification guide](./native-key-verification.md) | Real DPAPI, Keychain and Secret Service checks passed on both supported Node versions at supplemental commit `dafd5b2`; mock tests remain for failure injection |
| MCP owner policy and audit | [Policy tests](../tests/unit/context/mcp-policy.test.js), [permission guide](./agent-permissions.md) | Tool-boundary behavior checked; direct owner filesystem/shell access remains outside that boundary |
| Public API and declarations | [API reference](./api-reference.md), [export contract](../tests/contracts/exports.ts), [consumer contract](../tests/contracts/consumer.ts) | All 50 root value exports checked with positive/negative TypeScript cases; 1.x compatibility is not yet frozen |
| Upgrade and installed package | [Frozen migration fixtures](../tests/fixtures/migrations/), [package test](../scripts/test-package.js), [upgrade guide](./upgrade-guide.md) | Schema 0/1 upgrade fixtures and real tarball installation checked; schema-2 fixture added in the follow-up below |
| Platform and quality gates | [Exact-commit CI](https://github.com/Open-Self/Open-Self/actions/runs/34258836498), [release verification](https://github.com/Open-Self/Open-Self/actions/runs/34259371537) | Six OS/Node combinations passed; release workflow's overall failure is the separate npm job |
| Support and private reporting | [Support policy](./support-policy.md), [security policy](../SECURITY.md), [contributing](../CONTRIBUTING.md) | Policies present; private vulnerability reporting enabled and read back via GitHub API on audit date |
| Registry publication | OIDC recovery run and independently downloaded registry tarball above | RC.2 published with provenance under `next`; `latest` remains 0.7.0 |

The successful local suite contained 511 tests. Reported line coverage was 88.95%, with
the exclusions listed in [vitest.config.js](../vitest.config.js). Local coverage used 30-second
test/hook timeouts to accommodate local filesystem latency; CI passed with its unchanged
default timeouts. Coverage is not a claim that every CLI,
gateway, provider or dashboard interaction has been exercised live.

## Remaining work before v1.0

1. **Closed by the v0.13.2 correction: conflict candidate selection over the full interval.** The audited v0.13.1
   implementation searched at `validFrom` (or event/current time) before checking overlap.
   A stored decision valid March 1–June 1 is omitted for a proposal valid January 1–December 1,
   even with identical scope/type and threshold zero. An in-memory reproduction returned
   zero candidates where one interval-overlap candidate was expected. The correction applies temporal and
   permission filters before candidate limits. [Store regressions](../tests/unit/context/conflict-window.test.js)
   cover full windows, bounds, exclusions and 5,001 identical records; MCP policy tests exercise both tools.
2. **Closed by supplemental native-provider CI at `dafd5b2`.** Real Windows DPAPI, macOS
   Keychain and Linux Secret Service roundtrips passed on Node 22.13.0 and 24. The gate
   reopens an encrypted vault in a fresh process, checks unavailable-command behavior,
   removes only the test-owned key, and checks missing-key refusal. These same-account
   checks do not establish cross-account isolation or availability in every desktop session.
3. **Closed by the v0.13.2 fixtures: released schema-2 baseline.**
   [Frozen v0.13.1 SQL](../tests/fixtures/migrations/v0.13.1.sql) records its historical source hash
   and synthetic checkpoint state. The installed consumer verifies its memories, versions,
   deduplication, forgotten state and checkpoint references independently of current setup code.
4. **Closed by verified OIDC publication of RC.2.** npm trusts `Open-Self/Open-Self`, workflow
   `release.yml`, with direct publish permission and no environment. The recovery workflow
   checked the existing artifact's SHA-256 and published the same bytes. No token secret is needed.
5. **Run the final stable 1.0 version through the complete gates.** The RC evidence above closes
   the candidate platform/artifact checks; RC.2 registry publication is now verified. Resolve the
   current dependency audit findings above and recheck open release blockers,
   compatibility and upgrade notes, private reporting, platform CI, artifact contents/digest,
   and actual registry publication. Current evidence proves the cited 0.x and RC artifacts, not a
   future stable 1.0 version. External provider mocks and local-dashboard scope must remain explicit.

No open GitHub issues were returned at audit time. That does not close the gaps above:
absence of issue reports is weaker evidence than an exercised contract.

## Verified distribution

The available Context Vault artifact is
[openself-0.13.2.tgz](https://github.com/Open-Self/Open-Self/releases/download/v0.13.2/openself-0.13.2.tgz),
from the [v0.13.2 release](https://github.com/Open-Self/Open-Self/releases/tag/v0.13.2).
Its downloaded SHA-256 was verified as:

```text
10594cb80bcf19d12f747837b4efcf7ed12137fd2946df8812090a2d0e7627c2
```

The original npm publish job failed explicitly because `NPM_TOKEN` was absent. RC.2 has since
been published through OIDC as documented above; the README now offers the npm candidate as
well as the GitHub tarballs. Publishing a GitHub release and publishing to npm are distinct outcomes.
