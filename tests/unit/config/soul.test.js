/**
 * SOUL.md reader/writer utilities
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readSoul, writeSoul, parseSoul, soulExists } from '../../../src/config/soul.js';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const TMP_DIR = join(tmpdir(), `openself-soul-test-${Date.now()}`);
mkdirSync(TMP_DIR, { recursive: true });

afterAll(() => {
    try {
        rmSync(TMP_DIR, { recursive: true, force: true });
    } catch {
        /* ok */
    }
});

describe('soulExists', () => {
    it('returns false when SOUL.md missing', () => {
        expect(soulExists('/nonexistent/path')).toBe(false);
    });

    it('returns true after writing SOUL.md', () => {
        writeSoul('# SOUL.md\n## Identity\n- Name: Test', TMP_DIR);
        expect(soulExists(TMP_DIR)).toBe(true);
    });
});

describe('writeSoul + readSoul', () => {
    it('write then read returns same content', () => {
        const content = '# SOUL.md\n## Identity\n- Name: RoundTrip';
        writeSoul(content, TMP_DIR);
        const read = readSoul(TMP_DIR);
        expect(read).toBe(content);
    });

    it('readSoul returns null when file missing', () => {
        const emptyDir = join(TMP_DIR, 'empty-subdir');
        mkdirSync(emptyDir, { recursive: true });
        expect(readSoul(emptyDir)).toBeNull();
    });

    it('writeSoul creates dir if not existing', () => {
        const newDir = join(TMP_DIR, 'new-subdir');
        writeSoul('# content', newDir);
        expect(soulExists(newDir)).toBe(true);
    });
});

describe('parseSoul', () => {
    const SAMPLE = `# SOUL.md

## Identity
- Name: TestUser
- Language: Vietnamese

## Voice
- Catchphrases: ê, ok

## Boundaries
- Never share: passwords
`;

    it('returns sections object', () => {
        const sections = parseSoul(SAMPLE);
        expect(typeof sections).toBe('object');
    });

    it('extracts identity section', () => {
        const sections = parseSoul(SAMPLE);
        expect(sections).toHaveProperty('identity');
        expect(Array.isArray(sections.identity)).toBe(true);
    });

    it('identity section contains Name key', () => {
        const sections = parseSoul(SAMPLE);
        const nameItem = sections.identity.find((i) => i.key === 'Name');
        expect(nameItem).toBeDefined();
        expect(nameItem.value).toBe('TestUser');
    });

    it('extracts voice section', () => {
        const sections = parseSoul(SAMPLE);
        expect(sections).toHaveProperty('voice');
    });

    it('extracts boundaries section', () => {
        const sections = parseSoul(SAMPLE);
        expect(sections).toHaveProperty('boundaries');
    });

    it('handles empty content gracefully', () => {
        const sections = parseSoul('');
        expect(typeof sections).toBe('object');
    });
});
