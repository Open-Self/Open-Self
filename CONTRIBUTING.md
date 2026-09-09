# Contributing to OpenSelf

OpenSelf is a local-first Context Vault with existing personality and messaging integrations.
Start with the [roadmap](./docs/project-roadmap.md), [API contract](./docs/api-reference.md)
and [support policy](./docs/support-policy.md). See [release readiness](./docs/release-readiness.md)
for the current evidence and remaining work before 1.0.

## Bugs and proposals

Use the repository's bug or feature issue template. Include the installed version, Node
version, OS, reproducible steps and a small synthetic fixture. Do not upload personal
vaults, chat histories or credentials. Report vulnerabilities privately using
[SECURITY.md](./SECURITY.md), not public issues.

Useful contributions include recovery reliability, permission boundaries, realistic retrieval
evaluations, accessibility, source capture and clear documentation. Explain the user problem
and expected behavior before proposing an integration or a public contract change.

## Local development

Use Node >=22.13. CI covers Node 22.13.0 and 24 on Linux, Windows and macOS. Fork the
repository and create a branch from `main`, then run `npm ci`. Native SQLite installation
needs a compatible prebuild or a working native build toolchain.

```bash
npm run lint
npm run format:check
npm test
npm run test:coverage
npm run test:types
npm run test:package
npm run eval:context
npm audit --audit-level=moderate
npx --yes publint --strict
```

`test:package` builds the real tarball, installs production dependencies in a temporary consumer,
compiles NodeNext/Bundler examples and exercises CLI, MCP, dashboard, capture and recovery.
It requires package-registry access. Run checks appropriate to the change; the complete CI
matrix is required before a release. Use only synthetic fixtures and smoke-test data.
For checkout CLI testing, use `node src/cli/index.js`; `npx openself` can run a different
published registry version.

`npm run test:native-key` separately checks the real OS provider. Read the
[native-key verification guide](./docs/native-key-verification.md) for platform setup and
test-owned cleanup; CI runs it in isolated keychain/session environments.

For dashboard changes, install Chromium with `npx playwright install chromium`, then run
`npm run test:dashboard`. Linux CI uses `npx playwright install --with-deps chromium`.
The browser tests use an isolated in-memory vault with synthetic records and exercise the
real authenticated server in UTC, Ho Chi Minh City and New York timezones. Browser artifacts
under `test-results/` are temporary and must not be committed. These regressions cover date
editing and persistence; they are not a full accessibility or cross-browser audit.

Source uses ESM, kebab-case filenames and four-space formatting enforced by Prettier.
Keep changes focused and explain non-obvious decisions. Put regression tests under
`tests/unit/` or `tests/integration/` and synthetic fixtures under `tests/fixtures/`.
Prefer behavior checks over tests that simply repeat the implementation.

Public API changes require declarations, consumer examples and relevant documentation.
Preserve released-schema fixtures; do not regenerate historical schemas from current code.
Update the changelog and upgrade guide when users must change their calls or workflows.
Exact error messages are not a stable public interface unless explicitly documented.

Coverage gates are global lines >=80%, functions >=85%, branches >=72%, as configured in
[vitest.config.js](./vitest.config.js). That configuration has explicit exclusions, so the
percentage does not prove every entrypoint or live external integration was exercised.
Provider mocks test behavior without sending messages or spending API credits.

## Pull requests

Use a conventional commit message such as `fix(context): preserve history on failed capture`.
Describe the user-visible problem, resulting behavior, relevant validation and any migration
or compatibility impact. Include only task-relevant source, tests, docs and dependency metadata.
Never commit `.env`, credentials, databases, coverage or temporary files.

See [code standards](./docs/code-standards.md) for additional guidance. Executable lint,
format and CI configuration define the current automated gates.

## Maintainer releases

Follow the [release process](./docs/project-roadmap.md#release-process):

1. Update the manifest, lockfile, dated changelog and applicable migration notes.
2. Run the required checks and inspect package contents for private or generated data.
3. Commit and push. Verify all CI jobs for the exact commit before creating its version tag.
4. Push the matching `vX.Y.Z` tag. The release workflow repeats CI, checks the tag version,
   creates one tarball and publishes it as a GitHub release asset.
   Candidate tags such as `v1.0.0-rc.1` create GitHub prereleases without replacing Latest;
   their npm artifact uses `next`. Versions without a prerelease suffix use npm `latest`.
   Tags must exactly match the manifest; build metadata is not accepted for releases.
5. The npm job publishes that same artifact with provenance through npm Trusted Publishing
   (OIDC). Configure GitHub Actions publisher `Open-Self/Open-Self`, workflow `release.yml`,
   no environment, and allow direct `npm publish`. No npm token secret is required.
6. Verify the downloaded artifact digest and the exact version's registry metadata separately.
   If npm failed, resolve its stated cause and rerun failed jobs; do not move an existing tag.
7. Update README installation status when registry publication becomes available.

If a historical tag used an older authentication workflow, rerunning it also uses the old
workflow. Instead, dispatch `release.yml` from `main` with the existing `release_tag` and its
independently verified lowercase `sha256`. This recovery path downloads the already verified
GitHub release tarball, verifies its checksum, package name and version, then publishes the
same bytes with the appropriate npm tag. It does not rebuild or move the historical tag.
Use only releases whose original platform, browser and package verification gates passed.

Hotfixes use the same gates. A successful GitHub release is not evidence that npm publication
succeeded. Do not bypass the verified-artifact workflow with a manual `npm publish` from a checkout.

## License

Contributions are licensed under the repository's [MIT License](./LICENSE).
