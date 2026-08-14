import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PlaintextCodec, VaultCodec, normalizeKey } from '../../../src/context/vault-crypto.js';

describe('VaultCodec', () => {
    it('encrypts with randomized authenticated ciphertext and decrypts by purpose', () => {
        const codec = new VaultCodec(randomBytes(32));
        const first = codec.encode('private decision', 'content');
        const second = codec.encode('private decision', 'content');

        expect(first).toMatch(/^enc:v1:/);
        expect(first).not.toBe(second);
        expect(codec.decode(first, 'content')).toBe('private decision');
        expect(() => codec.decode(first, 'summary')).toThrow('Unable to decrypt');
    });

    it('builds deterministic opaque blind-index tokens', () => {
        const codec = new VaultCodec(Buffer.alloc(32, 7));
        const index = codec.indexText('SQLite database SQLite');

        expect(index).not.toContain('sqlite');
        expect(index.split(' ')[0]).toBe(index.split(' ')[2]);
        expect(codec.indexQuery('SQLite')).toContain(index.split(' ')[0]);
    });

    it('validates base64 and hex keys', () => {
        const key = randomBytes(32);
        expect(normalizeKey(key.toString('base64'))).toEqual(key);
        expect(normalizeKey(key.toString('hex'))).toEqual(key);
        expect(() => normalizeKey('short')).toThrow('exactly 32 bytes');
    });

    it('keeps plaintext behavior compatible', () => {
        const codec = new PlaintextCodec();
        expect(codec.encode('visible')).toBe('visible');
        expect(codec.indexQuery('hello world')).toBe('"hello" OR "world"');
    });
});
