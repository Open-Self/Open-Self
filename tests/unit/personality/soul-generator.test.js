/**
 * generateSoulMd / saveSoulMd — section rendering across languages, emoji tiers,
 * relationships and reply-time formatting.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { generateSoulMd, saveSoulMd } from '../../../src/personality/soul-generator.js';

function basePersonality(overrides = {}) {
    return {
        primaryLanguage: 'English',
        totalMessages: 100,
        avgMessageLength: 42,
        avgWordCount: 8,
        emojiFrequency: 0.05,
        formality: 'casual',
        humorPatterns: ['sarcasm'],
        greetingStyle: 'hey',
        responseTimeAvg: 45000,
        topEmojis: [{ emoji: '😂' }, { emoji: '🔥' }],
        catchphrases: ['lol', 'fr'],
        topWords: [{ word: 'yeah' }, { word: 'nice' }],
        pronounUsage: [],
        toneDiacritics: false,
        abbreviations: [],
        usesSlang: false,
        ...overrides,
    };
}

let dir;
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'openself-soulgen-'));
});
afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

describe('generateSoulMd', () => {
    it('renders identity, catchphrases and top emojis for an English profile', () => {
        const md = generateSoulMd(
            basePersonality(),
            { capitalizationStyle: 'lowercase' },
            {
                name: 'Zed',
            },
        );
        expect(md).toContain('- Name: Zed');
        expect(md).toContain('Language: English');
        expect(md).toContain('lol');
        expect(md).toContain('😂');
        expect(md).toContain('Capitalization: lowercase');
    });

    it('classifies emoji frequency into High / Medium / Low tiers', () => {
        const high = generateSoulMd(basePersonality({ emojiFrequency: 0.5 }), {}, {});
        const med = generateSoulMd(basePersonality({ emojiFrequency: 0.2 }), {}, {});
        const low = generateSoulMd(basePersonality({ emojiFrequency: 0.05 }), {}, {});
        expect(high).toContain('Emoji frequency: High');
        expect(med).toContain('Emoji frequency: Medium');
        expect(low).toContain('Emoji frequency: Low');
    });

    it('adds a Vietnamese Style section with pronouns, abbreviations and slang', () => {
        const md = generateSoulMd(
            basePersonality({
                primaryLanguage: 'Vietnamese',
                pronounUsage: ['t', 'm'],
                toneDiacritics: true,
                abbreviations: ['ko', 'dc'],
                usesSlang: true,
            }),
            { capitalizationStyle: 'lowercase' },
            {},
        );
        expect(md).toContain('## Vietnamese Style');
        expect(md).toContain('Pronoun usage: t, m');
        expect(md).toContain('Abbreviations: ko, dc');
        expect(md).toContain('Slang: Frequently used');
        expect(md).toContain('để t hỏi lại');
    });

    it('renders a Relationships section when contacts are provided', () => {
        const md = generateSoulMd(
            basePersonality(),
            {},
            {
                name: 'Zed',
                contacts: { Alice: { relationship: 'bestie', messageCount: 12 } },
            },
        );
        expect(md).toContain('## Relationships');
        expect(md).toContain('@Alice: bestie (12 messages)');
    });

    it('formats reply time across second / minute / hour / instant buckets', () => {
        expect(generateSoulMd(basePersonality({ responseTimeAvg: 30000 }), {}, {})).toContain(
            '30s',
        );
        expect(generateSoulMd(basePersonality({ responseTimeAvg: 120000 }), {}, {})).toContain(
            '2min',
        );
        expect(generateSoulMd(basePersonality({ responseTimeAvg: 7200000 }), {}, {})).toContain(
            '2h',
        );
        expect(generateSoulMd(basePersonality({ responseTimeAvg: -1 }), {}, {})).toContain(
            'instant',
        );
    });
});

describe('saveSoulMd', () => {
    it('writes SOUL.md to the data dir and returns its path', () => {
        const path = saveSoulMd('# SOUL\ncontent', dir);
        expect(path).toBe(join(dir, 'SOUL.md'));
        expect(existsSync(path)).toBe(true);
        expect(readFileSync(path, 'utf-8')).toContain('content');
    });
});
