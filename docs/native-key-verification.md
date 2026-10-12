# Native key-provider verification

`npm run test:native-key` exercises the real platform provider without injecting a test
backend. It creates a synthetic key and a temporary vault, verifies key roundtrip, reopens
an encrypted memory in a fresh Node process, checks refusal when provider commands are
unavailable, removes the test key, and checks that the vault then refuses to open.
It never prints key material. Cleanup targets only the generated test key and temporary vault.

The test deliberately removes `OPENSELF_VAULT_KEY` from its own process environment so an
environment key cannot make the native-provider test pass accidentally. A child process
with an isolated PATH exercises unavailable-provider behavior without changing the parent
environment or removing installed tools.

## Platform setup

- Windows uses CurrentUser DPAPI and a blob inside the temporary vault directory.
- macOS uses the current user's Keychain and a unique generated service name. CI creates
  an isolated, unlocked keychain and deletes it after the check. Do not copy CI's keychain
  configuration commands into a personal login session: they change the runner's default
  keychain/search list. Local invocation requires an available unlocked keychain.
- Linux needs `secret-tool` and an unlocked Secret Service session. CI installs GNOME
  Keyring and libsecret tools, starts a private D-Bus session and uses a temporary XDG data
  directory. Local invocation uses the available session and deletes only its generated entry.

The CI unlock password is public synthetic test data, not a publishing or user credential.
No test needs personal credentials, vaults or chats. Each native step has a five-minute
CI timeout, so an unavailable or interactive service fails the gate rather than hanging a release.

Command semantics are documented in Apple's
[Security tool source](https://github.com/apple-oss-distributions/Security/blob/main/SecurityTool/macOS/security.c)
and GNOME's [Secret Service tooling source](https://github.com/GNOME/libsecret/blob/main/tool/secret-tool.c).
The daemon unlock procedure follows GNOME's
[daemon startup guidance](https://bugzilla.gnome.org/show_bug.cgi?id=704956).

## Evidence and limits

The gate runs on both supported Node versions for Windows, macOS and Linux through the
shared CI workflow; tag releases inherit it. Its presence in YAML is not a passing result:
check the native integration step for the exact commit/run.

These checks establish a same-account key roundtrip and explicit refusal on missing keys
or unavailable tools. They do not establish cross-account isolation, resistance to a compromised
owner account, hardware-backed key storage, or availability in every desktop/headless session.
The mock-backed unit suite remains useful for portable failure injection and backup behavior.
