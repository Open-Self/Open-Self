import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

const ENCRYPTED_PREFIX = 'enc:v1:';

export class VaultCodec {
    constructor(key) {
        this.key = normalizeKey(key);
        this.enabled = true;
    }

    encode(value, purpose = 'field') {
        const text = String(value ?? '');
        const nonce = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
        cipher.setAAD(Buffer.from(`openself:${purpose}`));
        const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return `${ENCRYPTED_PREFIX}${Buffer.concat([nonce, tag, ciphertext]).toString('base64')}`;
    }

    decode(value, purpose = 'field') {
        const text = String(value ?? '');
        if (!text.startsWith(ENCRYPTED_PREFIX)) return text;
        try {
            const payload = Buffer.from(text.slice(ENCRYPTED_PREFIX.length), 'base64');
            if (payload.length < 28) throw new Error('payload is too short');
            const nonce = payload.subarray(0, 12);
            const tag = payload.subarray(12, 28);
            const ciphertext = payload.subarray(28);
            const decipher = createDecipheriv('aes-256-gcm', this.key, nonce);
            decipher.setAAD(Buffer.from(`openself:${purpose}`));
            decipher.setAuthTag(tag);
            return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
        } catch (error) {
            throw new Error(`Unable to decrypt OpenSelf vault ${purpose}: ${error.message}`, {
                cause: error,
            });
        }
    }

    indexText(value) {
        return tokenize(value)
            .map((token) => this._blindToken(token))
            .join(' ');
    }

    indexQuery(value) {
        return tokenize(value)
            .slice(0, 20)
            .map((token) => `"${this._blindToken(token)}"`)
            .join(' OR ');
    }

    isEncrypted(value) {
        return String(value || '').startsWith(ENCRYPTED_PREFIX);
    }

    _blindToken(token) {
        return `h${createHmac('sha256', this.key).update(`index:${token}`).digest('hex')}`;
    }
}

export class PlaintextCodec {
    constructor() {
        this.enabled = false;
    }

    encode(value) {
        return String(value ?? '');
    }

    decode(value) {
        return String(value ?? '');
    }

    indexText(value) {
        return String(value || '');
    }

    indexQuery(value) {
        return tokenize(value)
            .slice(0, 20)
            .map((token) => `"${token.replaceAll('"', '""')}"`)
            .join(' OR ');
    }

    isEncrypted() {
        return false;
    }
}

export function normalizeKey(value) {
    if (Buffer.isBuffer(value) && value.length === 32) return Buffer.from(value);
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (/^[a-f0-9]{64}$/i.test(trimmed)) return Buffer.from(trimmed, 'hex');
        const decoded = Buffer.from(trimmed, 'base64');
        if (decoded.length === 32) return decoded;
    }
    throw new Error('Vault encryption key must be exactly 32 bytes (base64 or 64 hex characters)');
}

function tokenize(value) {
    return (
        String(value || '')
            .normalize('NFKC')
            .toLowerCase()
            .match(/[\p{L}\p{N}_-]+/gu) || []
    );
}
