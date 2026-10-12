import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';

const deriveKey = promisify(scrypt);
const MAGIC = Buffer.from('OpenSelfBackup\0');
const VERSION = 1;
const PREFIX_SIZE = MAGIC.length + 1 + 16 + 12;
export const MAX_BACKUP_BYTES = 256 * 1024 * 1024;

async function keyFor(passphrase, salt) {
    if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 1024) {
        throw new Error('Backup passphrase must contain 12 to 1024 characters');
    }
    return deriveKey(passphrase, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

export async function sealBackup(database, metadata, passphrase) {
    const header = Buffer.from(JSON.stringify(metadata));
    const length = Buffer.alloc(4);
    length.writeUInt32BE(header.length);
    const body = Buffer.concat([length, header, database]);
    if (header.length > 4096 || body.length + PREFIX_SIZE + 16 > MAX_BACKUP_BYTES) {
        body.fill(0);
        throw new Error('Backup exceeds the 256 MiB format limit');
    }
    const salt = randomBytes(16);
    const nonce = randomBytes(12);
    const prefix = Buffer.concat([MAGIC, Buffer.from([VERSION]), salt, nonce]);
    let key;
    try {
        key = await keyFor(passphrase, salt);
        const cipher = createCipheriv('aes-256-gcm', key, nonce);
        cipher.setAAD(prefix);
        const encrypted = Buffer.concat([cipher.update(body), cipher.final()]);
        return Buffer.concat([prefix, cipher.getAuthTag(), encrypted]);
    } finally {
        key?.fill(0);
        body.fill(0);
    }
}

export async function openBackup(archive, passphrase) {
    if (
        archive.length > MAX_BACKUP_BYTES ||
        archive.length < PREFIX_SIZE + 20 ||
        !archive.subarray(0, MAGIC.length).equals(MAGIC)
    ) {
        throw new Error('Invalid or oversized OpenSelf backup');
    }
    if (archive[MAGIC.length] !== VERSION) throw new Error('Unsupported backup format version');
    const salt = archive.subarray(MAGIC.length + 1, MAGIC.length + 17);
    const nonce = archive.subarray(MAGIC.length + 17, PREFIX_SIZE);
    const key = await keyFor(passphrase, salt);
    let body;
    try {
        const decipher = createDecipheriv('aes-256-gcm', key, nonce);
        decipher.setAAD(archive.subarray(0, PREFIX_SIZE));
        decipher.setAuthTag(archive.subarray(PREFIX_SIZE, PREFIX_SIZE + 16));
        body = Buffer.concat([
            decipher.update(archive.subarray(PREFIX_SIZE + 16)),
            decipher.final(),
        ]);
        const length = body.readUInt32BE(0);
        if (length > 4096 || length + 4 >= body.length) throw new Error('Invalid manifest length');
        const metadata = JSON.parse(body.subarray(4, length + 4).toString('utf8'));
        return { metadata, database: Buffer.from(body.subarray(length + 4)) };
    } catch {
        throw new Error(
            'Backup authentication or format validation failed; check the passphrase and file',
        );
    } finally {
        key.fill(0);
        body?.fill(0);
    }
}
