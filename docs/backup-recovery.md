# Context Vault backup and recovery

`openself vault backup` creates a portable, encrypted snapshot of the Context Vault.
`openself vault restore` restores it into a **new directory** and protects its payload
key using the destination account's OS key provider.

## Create a backup

```bash
openself vault backup --data-dir ./data --file ./backups/context.osbackup
```

The terminal prompts for a passphrase and confirmation. Use a unique, strong passphrase
and keep it in a password manager separately from the backup. The supported length is
12 to 1024 characters. Losing this passphrase makes the backup unrecoverable; your OS
account alone cannot unlock it. No passphrase is accepted as a command-line argument.

For unattended jobs, use `OPENSELF_BACKUP_PASSPHRASE` through your secret manager, or
`--passphrase-file /protected/path/backup-passphrase`. A single trailing newline is
removed from a passphrase file; other whitespace is significant. Protect that file
with OS permissions and never commit it. These mechanisms also work for restore.

The source vault must already exist and its payload key must be available. The backup
can run while the vault is open: it serializes a consistent SQLite snapshot, including
committed WAL data, before encrypting. Writes after that snapshot are not in the backup.
An explicit unfinished transaction on the supplied JavaScript store is rejected.

An existing backup path is never overwritten. Use dated filenames and maintain your
own retention policy. The filesystem must support hard links for exclusive atomic
publication of the completed backup. The temporary file is also encrypted.

## Restore on this or another machine

Install OpenSelf >=0.10.0 and prepare the destination OS key provider:

- Windows: DPAPI under the account that will run OpenSelf.
- macOS: an accessible Keychain for that account.
- Linux: `secret-tool` and an unlocked Secret Service session. A headless session
  without a key provider cannot complete this OS-bound restore.

```bash
openself vault restore --file ./backups/context.osbackup --data-dir ./recovered-data
openself vault status --data-dir ./recovered-data
openself memory search --data-dir ./recovered-data --query "database decision"
openself dashboard --data-dir ./recovered-data
```

Restore prompts for the backup passphrase. `--data-dir` must be explicit and must not
exist, including an empty directory or symlink. Restore validates authenticated content,
format/schema version, SQLite integrity and foreign keys, required tables, payloads,
version history, and retrieval vectors before publishing the destination directory.

The destination is always payload-encrypted, including when the source was plaintext.
Plaintext source pages are rebuilt in memory before any database image is written.
The payload key travels only inside the encrypted backup and is rebound to the target
OS account; copying a Windows DPAPI blob between machines is not required.

If `OPENSELF_VAULT_KEY` is set, it overrides OS key loading in normal vault commands.
Remove that override when opening the restored OS-bound vault unless it deliberately
contains that vault's key. Never print or copy a payload key into logs or shell history.

Open the restored vault and verify representative current and historical memories before
switching clients to it or retiring your original data. Keep the original vault and
backup until recovery has been verified.

## What is included

The complete Context Vault SQLite state: active and forgotten memories, provenance,
version history, import deduplication ledger, lexical index, vectors, and vault metadata.
The backup's outer encryption also hides operational metadata such as scopes and times.
The restored database uses the usual payload encryption model: operational metadata is
visible locally, as explained in [Context Vault](./context-vault.md).

This is **not a whole application-directory backup**. It excludes personality profiles,
messaging sessions, API keys, source documents, owner MCP policy files, `mcp-audit.db`,
and `connectors/` polling state. Reapply owner policy when attaching agents to a restored vault. Existing
captured memories are preserved, but watchers are not restarted automatically. Reattaching
a connector with missing polling state can import duplicate source chunks; do so only
after reviewing its source and scope. Import deduplication entries within SQLite survive.

## Failure behavior and limits

- Wrong passphrase, modified or truncated file: authentication fails and no destination
  vault is published. Keep the original backup; retry with the correct passphrase.
- Unsupported format or schema: use a compatible OpenSelf version. Future database
  schema versions are refused before normal vault initialization can modify them.
- Disk or OS key-provider failure: the incomplete staging directory is removed for
  caught errors. A process kill or power loss can leave an encrypted `.tmp` backup or
  `.openself-restore-*` directory beside the destination. It is not a completed restore.
  Inspect it before removal and retry with a new destination. OS keychain services can
  retain an unused key entry if a later filesystem step fails.
- The v1 archive limit is 256 MiB. Serialization and authenticated encryption use several
  in-memory buffers; this implementation targets personal vaults, not multi-gigabyte
  archives. It does not stream plaintext to disk to bypass this bound.
- Backups preserve forgotten records for recovery. Delete old backups separately when
  your retention requirements call for permanent removal.

The v1 format uses AES-256-GCM with a random 96-bit nonce, a random 128-bit salt, and
scrypt (`N=32768`, `r=8`, `p=1`) to derive a 256-bit archive key. The format prefix is
additional authenticated data. Only the format/version, salt, nonce, ciphertext size,
and authentication tag are outside the ciphertext. There is no cloud upload or network
request in the backup/restore implementation.

## JavaScript API

```js
import { ContextStore, backupVault, restoreVault } from 'openself';

const store = new ContextStore({ dataDir: './data' });
try {
    await backupVault(store, './context.osbackup', {
        passphrase: process.env.OPENSELF_BACKUP_PASSPHRASE,
    });
} finally {
    store.close();
}
await restoreVault('./context.osbackup', './recovered-data', {
    passphrase: process.env.OPENSELF_BACKUP_PASSPHRASE,
});
```
