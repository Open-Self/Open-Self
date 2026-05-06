/**
 * Personality Loader — P1 regression (phase-01 new module)
 * loadPersonality(missingDir) → {}
 * mergePersonality overrides numeric keys from json
 * avgMessageLength string coerced to number
 */
import { describe, it, expect } from 'vitest';
import { loadPersonality, mergePersonality } from '../../../src/config/personality-loader.js';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function makeTmpDir(suffix) {
    const dir = join(tmpdir(), `openself-pers-${suffix}-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    return dir;
}

describe('loadPersonality', () => {
    it('returns {} when directory does not exist', () => {
        const result = loadPersonality('/nonexistent/path/xyz');
        expect(result).toEqual({});
    });

    it('returns {} when personality.json missing in dir', () => {
        const dir = makeTmpDir('empty');
        const result = loadPersonality(dir);
        expect(result).toEqual({});
    });

    it('returns parsed JSON when file exists', () => {
        const dir = makeTmpDir('valid');
        writeFileSync(
            join(dir, 'personality.json'),
            JSON.stringify({ avgMessageLength: 42, typoRate: 0.03 }),
            'utf-8',
        );
        const result = loadPersonality(dir);
        expect(result.avgMessageLength).toBe(42);
        expect(result.typoRate).toBe(0.03);
    });

    it('returns {} on corrupt JSON (no throw)', () => {
        const dir = makeTmpDir('corrupt');
        writeFileSync(join(dir, 'personality.json'), '{bad json', 'utf-8');
        expect(() => loadPersonality(dir)).not.toThrow();
        expect(loadPersonality(dir)).toEqual({});
    });
});

describe('mergePersonality', () => {
    it('keeps soul string fields intact', () => {
        const soul = { name: 'TestUser', language: 'Vietnamese' };
        const merged = mergePersonality(soul, {});
        expect(merged.name).toBe('TestUser');
        expect(merged.language).toBe('Vietnamese');
    });

    it('overlays numeric keys from personalityJson', () => {
        const soul = { name: 'X', responseTimeAvg: 60000 };
        const json = { responseTimeAvg: 30000 };
        const merged = mergePersonality(soul, json);
        expect(merged.responseTimeAvg).toBe(30000);
    });

    it('overlays all NUMERIC_KEYS from json', () => {
        const soul = {};
        const json = {
            responseTimeAvg: 45000,
            avgMessageLength: 30,
            avgWordCount: 6,
            emojiFrequency: 0.4,
            typoRate: 0.02,
            onlineHoursStart: 9,
            onlineHoursEnd: 22,
            capitalizationStyle: 'lowercase',
        };
        const merged = mergePersonality(soul, json);
        expect(merged.responseTimeAvg).toBe(45000);
        expect(merged.avgMessageLength).toBe(30);
        expect(merged.typoRate).toBe(0.02);
        expect(merged.onlineHoursStart).toBe(9);
        expect(merged.capitalizationStyle).toBe('lowercase');
    });

    it('coerces avgMessageLength "47 chars" string to number 47', () => {
        const soul = { avgMessageLength: '47 chars' };
        const merged = mergePersonality(soul, {});
        expect(merged.avgMessageLength).toBe(47);
    });

    it('coerces avgMessageLength "25" string to number 25', () => {
        const soul = { avgMessageLength: '25' };
        const merged = mergePersonality(soul, {});
        expect(merged.avgMessageLength).toBe(25);
    });

    it('leaves avgMessageLength as number when already numeric', () => {
        const soul = { avgMessageLength: 50 };
        const merged = mergePersonality(soul, {});
        expect(merged.avgMessageLength).toBe(50);
    });

    it('does NOT override json numeric key with soul string if both present', () => {
        const soul = { avgMessageLength: '99 chars' };
        const json = { avgMessageLength: 42 };
        const merged = mergePersonality(soul, json);
        // json wins for numeric keys
        expect(merged.avgMessageLength).toBe(42);
    });

    it('populates catchphrases from json array when soul has none', () => {
        const soul = { catchphrases: '' };
        const json = { catchphrases: ['ê', 'ok', 'ừ'] };
        const merged = mergePersonality(soul, json);
        expect(merged.catchphrases).toContain('ê');
    });

    it('populates abbreviations from json array when soul has none', () => {
        const soul = { abbreviations: '' };
        const json = { abbreviations: ['oke', 'k'] };
        const merged = mergePersonality(soul, json);
        expect(merged.abbreviations).toContain('oke');
    });

    it('does not override soul catchphrases if already set', () => {
        const soul = { catchphrases: 'yo, hey' };
        const json = { catchphrases: ['ê', 'ok'] };
        const merged = mergePersonality(soul, json);
        expect(merged.catchphrases).toBe('yo, hey');
    });
});
