# Support and compatibility policy

OpenSelf is an MIT-licensed, local-first project. Support is best effort through public
issues and pull requests; there is no guaranteed response time or hosted service dependency.
Report security-sensitive findings using [SECURITY.md](../SECURITY.md).

## Runtime support

- Minimum declared runtime: Node.js 22.13.0.
- Release CI tests Node 22.13.0 and the Node 24 line on Linux, Windows, and macOS.
- Other versions satisfying `engines` are not automatically covered by the CI matrix.
- SQLite is a native dependency. Installation must run dependency install scripts and
  obtain a compatible prebuild or have a working native build toolchain.
- TypeScript is optional for consumers. Declarations are tested with the compiler pinned
  in `package-lock.json`, under strict NodeNext and Bundler module resolution.
- Payload key providers require Windows DPAPI, macOS Keychain, or an accessible Linux
  Secret Service session. Cloud model/gateway services require their own credentials.

## Release and maintenance policy

During 0.x, the latest minor is the maintenance target. Breaking behavior changes must
be explained in the changelog and upgrade guide. Security fixes take priority over
preserving unsafe behavior. Backports to older minors are not promised.

Before declaring 1.0, maintainers must review the supported public contracts, run all
release gates, verify an actual installed package, and publish the migration/support
notes. Stable 1.x releases will preserve documented API contracts; breaking changes
require a major version. Internal SQL schemas and underscored methods are not public APIs.
The full API contract is described in [API reference](./api-reference.md).

Every version tag runs platform tests, coverage thresholds, retrieval/privacy evaluations,
a dependency audit, declaration checks, isolated package installation and consumer tests,
strict publint, and packaging checks before a GitHub release artifact is created.
A GitHub release and an npm registry publication are distinct outcomes. Missing npm
credentials must fail the publish job rather than silently claim success.

## Evidence and limitations

The isolated consumer test installs the real tarball with production dependencies,
compiles TypeScript in NodeNext and Bundler modes, checks all public value exports,
executes the CLI, upgrades frozen released schemas, exercises MCP permissions, serves
an authenticated dashboard asset, and round-trips an encrypted backup.

Migration fixtures contain synthetic data and schema SQL frozen from the v0.9.1,
v0.11.0 and v0.13.1 release tags, with source hashes recorded in each file. They are not generated
from the current migration code during tests. This detects schema drift independently
of current initialization logic; it does not prove recovery of arbitrary corrupted data.

Provider calls and messaging adapters have mock-based regression coverage. CI does not
send messages, access personal accounts, or establish that every external API is live.
The context dashboard remains a local administration surface. MCP policy enforcement
requires protecting the policy, launcher and vault from direct agent filesystem access.

## Contributing a compatibility change

Update the declaration, API docs, changelog and upgrade notes together. Add a positive
consumer example plus a negative type assertion when useful. If an export is intentionally
added or removed, update `tests/contracts/exports.ts`; the compiler and runtime checks
must agree on the resulting export set. Preserve frozen migration fixtures and add a
new versioned fixture when the database schema changes.
