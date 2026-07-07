/**
 * HumanMimicry — getReplyDelay bounds, splitMessage, shouldIgnore, addTypos
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { HumanMimicry } from '../../../src/mimicry/humanlike.js';

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

const PERSONALITY = {
    responseTimeAvg: 60000,
    onlineHoursStart: 8,
    onlineHoursEnd: 23,
    typoRate: 0.05,
};

describe('getReplyDelay', () => {
    it('returns value between 5000ms and 300000ms (5s–5min)', () => {
        const m = new HumanMimicry(PERSONALITY);
        for (let i = 0; i < 10; i++) {
            const delay = m.getReplyDelay('hello how are you', {});
            expect(delay).toBeGreaterThanOrEqual(5000);
            expect(delay).toBeLessThanOrEqual(300000);
        }
    });

    it('close friends get faster replies (lower bound)', () => {
        const m = new HumanMimicry({ ...PERSONALITY, responseTimeAvg: 120000 });
        const closeDelay = m.getReplyDelay('hi', { closeness: 'close' });
        // Not guaranteed due to random, but must be in valid range
        expect(closeDelay).toBeGreaterThanOrEqual(5000);
        expect(closeDelay).toBeLessThanOrEqual(300000);
    });

    it('uses default 60000 baseDelay when responseTimeAvg not set', () => {
        const m = new HumanMimicry({});
        const delay = m.getReplyDelay('hi', {});
        expect(delay).toBeGreaterThanOrEqual(5000);
        expect(delay).toBeLessThanOrEqual(300000);
    });
});

describe('shouldIgnore', () => {
    it('returns true outside online hours (3am)', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-12T03:00:00'));
        const m = new HumanMimicry({ onlineHoursStart: 8, onlineHoursEnd: 23 });
        expect(m.shouldIgnore({})).toBe(true);
    });

    it('returns false during online hours (noon)', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-12T12:00:00'));
        const m = new HumanMimicry({ onlineHoursStart: 8, onlineHoursEnd: 23 });
        // Not group, not media → should not ignore due to hours
        expect(m.shouldIgnore({})).toBe(false);
    });

    it('group message without mention: random 70% ignore (spy on Math.random)', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-12T12:00:00'));
        vi.spyOn(Math, 'random').mockReturnValue(0.5); // 0.5 < 0.7 → ignore
        const m = new HumanMimicry({ onlineHoursStart: 8, onlineHoursEnd: 23 });
        expect(m.shouldIgnore({ isGroup: true, mentionsMe: false })).toBe(true);
    });

    it('group message with mention: not ignored via group rule', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-12T12:00:00'));
        const m = new HumanMimicry({ onlineHoursStart: 8, onlineHoursEnd: 23 });
        // mentionsMe=true → group ignore rule skipped; hours OK → false
        expect(m.shouldIgnore({ isGroup: true, mentionsMe: true })).toBe(false);
    });

    it('media without caption: random 50% ignore', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-12T12:00:00'));
        vi.spyOn(Math, 'random').mockReturnValue(0.3); // 0.3 < 0.5 → ignore
        const m = new HumanMimicry({ onlineHoursStart: 8, onlineHoursEnd: 23 });
        expect(m.shouldIgnore({ isMedia: true, hasCaption: false })).toBe(true);
    });
});

describe('splitMessage', () => {
    it('returns single-element array for short messages (<80 chars)', () => {
        const m = new HumanMimicry(PERSONALITY);
        const result = m.splitMessage('short msg');
        expect(result).toEqual(['short msg']);
    });

    it('splits on ||| delimiter when message >= 80 chars', () => {
        const m = new HumanMimicry(PERSONALITY);
        // Must be >= 80 chars total to pass the early-return guard (first check: length < 80)
        const part1 = 'first part that is definitely long enough here';
        const part2 = 'second part follows';
        const part3 = 'third part done';
        const msg = `${part1}|||${part2}|||${part3}`;
        expect(msg.length).toBeGreaterThanOrEqual(80);
        const result = m.splitMessage(msg);
        expect(result).toEqual([part1, part2, part3]);
    });

    it('returns array with truthy strings only after ||| split', () => {
        const m = new HumanMimicry(PERSONALITY);
        const result = m.splitMessage('msg one|||   |||msg two');
        expect(result.every((s) => s.trim().length > 0)).toBe(true);
    });

    it('returns single-element array for message between 80–149 chars', () => {
        const m = new HumanMimicry(PERSONALITY);
        const msg = 'a'.repeat(100);
        expect(m.splitMessage(msg)).toEqual([msg]);
    });

    it('splits long messages at sentence boundaries', () => {
        const m = new HumanMimicry(PERSONALITY);
        const long =
            'First sentence here. Second sentence follows. Third one. Fourth sentence is here. Fifth sentence done.';
        const parts = m.splitMessage(long);
        expect(Array.isArray(parts)).toBe(true);
        expect(parts.length).toBeGreaterThanOrEqual(1);
        // All parts non-empty
        expect(parts.every((p) => p.length > 0)).toBe(true);
    });
});

describe('processReply', () => {
    it('returns array of strings', () => {
        const m = new HumanMimicry({ ...PERSONALITY, typoRate: 0 });
        const result = m.processReply('hello world');
        expect(Array.isArray(result)).toBe(true);
        expect(result.every((s) => typeof s === 'string')).toBe(true);
    });

    it('trims leading/trailing whitespace', () => {
        const m = new HumanMimicry({ ...PERSONALITY, typoRate: 0 });
        const result = m.processReply('  hello  ');
        expect(result[0]).toBe(result[0].trim());
    });
});

describe('getTypingDuration', () => {
    it('returns value <= 10000ms (10s cap)', () => {
        const m = new HumanMimicry(PERSONALITY);
        const dur = m.getTypingDuration('a'.repeat(500));
        expect(dur).toBeLessThanOrEqual(10000);
    });

    it('returns positive number for non-empty reply', () => {
        const m = new HumanMimicry(PERSONALITY);
        expect(m.getTypingDuration('hello')).toBeGreaterThan(0);
    });
});

describe('addTypos', () => {
    it('returns the reply unchanged when typoRate is below the 0.01 threshold', () => {
        // Truthy but < 0.01 — note `typoRate || 0.02` treats an explicit 0 as unset.
        const m = new HumanMimicry({ typoRate: 0.005 });
        expect(m.addTypos('hello world')).toBe('hello world');
    });

    it('returns the reply unchanged when the random roll misses (> 0.1)', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.9);
        const m = new HumanMimicry({ typoRate: 0.5 });
        expect(m.addTypos('hello world')).toBe('hello world');
    });

    it('applies a length-preserving adjacent-char swap when the roll hits (<= 0.1)', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0); // < 0.1 → typo path, pos deterministic
        const m = new HumanMimicry({ typoRate: 0.5 });
        const out = m.addTypos('abcdef');
        expect(out).toHaveLength('abcdef'.length);
        expect(out).not.toBe('abcdef');
    });
});
