# v1.0 release verification

## Current stable patch: 1.0.1

On 2026-09-09, [v1.0.1](https://github.com/Open-Self/Open-Self/releases/tag/v1.0.1) replaced
1.0.0 as npm `latest` and GitHub Latest. It corrects the README shipped to npm; runtime,
dependencies and schema are unchanged. The npm README now shows `npm install -g openself`
and stable 1.x, rather than the old 0.7.0 installation status. `next` remains RC.2.

Commit [`94fe5c8`](https://github.com/Open-Self/Open-Self/tree/94fe5c80a1d7573ec891ca365ddba04c58692b35)
passed all seven [branch CI jobs](https://github.com/Open-Self/Open-Self/actions/runs/34317234493)
and all seven checks in the [release workflow](https://github.com/Open-Self/Open-Self/actions/runs/34317919884),
followed by successful packaging and OIDC publication. npm metadata includes provenance.
The independently downloaded GitHub and npm tarballs both contain version 1.0.1 and the
corrected README, with the same verified SHA-256:

```text
641816a364b2e7009b5748d026fd99a0e16a70dfaf041c376929221c7bd37374
```

The foundation release evidence below is retained as the point-in-time 1.0.0 audit.

## Foundation release: 1.0.0

Verified on 2026-09-09 against [`856128a` / v1.0.0](https://github.com/Open-Self/Open-Self/tree/856128a75f686621ab7096346009ad846be8e59f).
This is a point-in-time evidence record. It establishes the documented release gates and
successful distribution, not the absence of every possible defect or vulnerability.

## Released artifacts

- [GitHub v1.0.0](https://github.com/Open-Self/Open-Self/releases/tag/v1.0.0) is a stable release and GitHub Latest.
- npm `latest` is `1.0.0`; `next` remains `1.0.0-rc.2`.
- The exact npm version metadata includes a SLSA provenance attestation; publication used OIDC without an npm token secret.
- The GitHub and npm tarballs were downloaded independently. Both contain package version `1.0.0` and share the SHA-256 below.
- The 104 archive entries were checked for private runtime/generated files. Installed-package CI separately checks package contents and runs consumer contracts.

```text
24d264272590167f333614d9cad264f209e2c86bde476f9087dffcf6af0366a6
```

[GitHub tarball](https://github.com/Open-Self/Open-Self/releases/download/v1.0.0/openself-1.0.0.tgz)
and [npm package](https://www.npmjs.com/package/openself/v/1.0.0).
Install the CLI with `npm install -g openself`, or the library with `npm install openself`.
Use `openself@1.0.0` to pin this release.

## Quality and compatibility evidence

[Branch CI](https://github.com/Open-Self/Open-Self/actions/runs/34315722112) passed all seven
jobs for the exact release commit. The [release workflow](https://github.com/Open-Self/Open-Self/actions/runs/34316074416)
repeated all seven successfully, then packaged and published successfully. The recovery job
was skipped because this was a normal tag release.

| Requirement | Evidence and scope |
|---|---|
| Platform support | Linux, Windows and macOS on Node 22.13.0 and 24 passed the shared CI gates |
| Native OS keys | Real DPAPI, Keychain and Secret Service roundtrips, process reopening and missing/unavailable-key refusal; [native verification guide](./native-key-verification.md) |
| Typed memory and provenance | [Store tests](../tests/unit/context/store.test.js), [schema tests](../tests/unit/context/schema.test.js) |
| Scope, sensitivity and agent authorization | [MCP policy regressions](../tests/unit/context/mcp-policy.test.js), [documented owner boundary](./agent-permissions.md) |
| Temporal retrieval and context budget | [Offset regressions](../tests/unit/context/temporal-offsets.test.js), [budget regressions](../tests/unit/context/context-budget.test.js), context evaluations |
| Full-window conflict selection | [Conflict-window regressions](../tests/unit/context/conflict-window.test.js), including 5,001 identical records and MCP policy cases |
| Incremental capture and interruption recovery | [Capture recovery tests](../tests/unit/context/capture-recovery.test.js), transactional SQLite checkpoints |
| Encryption and portable restore | [Backup tests](../tests/unit/context/backup.test.js), [crypto tests](../tests/unit/context/vault-crypto.test.js), installed-consumer backup/restore |
| Public API | All 50 root value exports checked by [export contract](../tests/contracts/exports.ts) and [consumer contract](../tests/contracts/consumer.ts); stable boundaries in [API reference](./api-reference.md) |
| Migration and actual package installation | [Frozen released-schema fixtures](../tests/fixtures/migrations/) for schema 0/1/2 and [isolated tarball consumer](../scripts/test-package.js), including NodeNext/Bundler declarations, MCP, dashboard and CLI |
| Dashboard date editing | [12 Chromium cases](../tests/browser/dashboard.spec.js) across UTC, Ho Chi Minh City and New York, including timestamp precision, repeated DST hours, clearing dates and new undated records |
| Dependency security | Patched Vitest/coverage-v8 4.1.11, Hono 4.13.7 and Sharp 0.35.4 in the lockfile; npm audit returned zero vulnerabilities locally and passed on all platform jobs |
| Support, upgrade and reporting | [Support policy](./support-policy.md), [upgrade guide](./upgrade-guide.md), [security policy](../SECURITY.md); private vulnerability reporting enabled and read back from GitHub API |
| Distribution | Successful OIDC publish, npm `latest` metadata and matching independently downloaded GitHub/npm digests above |

The local suite passed 527 Vitest tests in 56 files and 12 separate Chromium tests. Local
coverage reported lines 88.95%, statements 87.35%, functions 90.38% and branches 78.38%.
Coverage uses the explicit exclusions in [vitest.config.js](../vitest.config.js), including
browser dashboard code; Chromium tests are separate from that metric. Local coverage used
30-second test/hook timeouts for filesystem latency; platform CI used its default timeouts.
Lint, formatting, declarations, installed consumer, context evaluations and strict publint passed.

## Candidate blockers resolved

1. Full validity-window conflict selection was corrected in v0.13.2 and retained in 1.0.
2. Real native key-provider checks passed across the six supported OS/Node combinations.
3. Frozen schema-2 migration/checkpoint evidence complements the earlier schema-0/1 fixtures.
4. RC.2 proved tokenless npm publication through [OIDC recovery](https://github.com/Open-Self/Open-Self/actions/runs/34305803185); stable 1.0 then passed the normal tag publication path.
5. The later RC.2 dependency audit findings were patched; the exact stable version passed all release gates and was verified on npm `latest`.
6. Dashboard timestamp truncation and ineffective date clearing were reproduced in real Chromium, corrected in RC.2, and verified again in 1.0.

No open GitHub issues were returned during the release audit. That observation supplements
the tests; absence of issue reports alone is not evidence of correctness.

## Limits retained in the stable contract

External model and messaging integrations have mock-based regression coverage; CI does not
send real messages or prove live provider availability. The dashboard is a local administration
surface, and its date-edit regressions are not a complete accessibility or cross-browser audit.
Native key checks run under the same account and do not establish cross-account or hardware
isolation. MCP policy does not protect a vault from direct owner filesystem/shell access.
Encrypted payloads do not hide all metadata. Conflict scores remain heuristic. These boundaries
are part of the documented product, not claims expanded by the stable version number.
