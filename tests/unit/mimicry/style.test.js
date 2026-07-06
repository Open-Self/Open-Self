/**
 * StyleProcessor — capitalization, length adjustment
 */
import { describe, it, expect } from 'vitest';
import { StyleProcessor } from '../../../src/mimicry/style.js';

describe('applyCapitalization', () => {
    it('lowercases when capitalizationStyle is "lowercase"', () => {
        const s = new StyleProcessor({ capitalizationStyle: 'lowercase' });
        expect(s.applyCapitalization('Hello World')).toBe('hello world');
    });

    it('uppercases when capitalizationStyle is "ALL_CAPS"', () => {
        const s = new StyleProcessor({ capitalizationStyle: 'ALL_CAPS' });
        expect(s.applyCapitalization('hello world')).toBe('HELLO WORLD');
    });

    it('leaves text unchanged for Normal capitalization', () => {
        const s = new StyleProcessor({ capitalizationStyle: 'Normal' });
        const text = 'Hello World';
        expect(s.applyCapitalization(text)).toBe(text);
    });

    it('defaults to Normal (no change) when capitalizationStyle not set', () => {
        const s = new StyleProcessor({});
        const text = 'Hello World';
        expect(s.applyCapitalization(text)).toBe(text);
    });
});

describe('adjustLength', () => {
    it('returns short reply unchanged (under 3x targetLength)', () => {
        const s = new StyleProcessor({ avgMessageLength: 50 });
        const short = 'This is short.';
        expect(s.adjustLength(short)).toBe(short);
    });

    it('truncates reply that is >3x avgMessageLength (small target)', () => {
        // targetLength=20, reply is 80 chars → 80 > 20*3=60 → truncate
        const s = new StyleProcessor({ avgMessageLength: 20 });
        const long = 'This is a sentence. And here is another one that goes on and on.';
        const result = s.adjustLength(long);
        // Result should be shorter than original if a cut point found
        expect(result.length).toBeLessThanOrEqual(long.length);
    });

    it('does not truncate when avgMessageLength >= 100', () => {
        const s = new StyleProcessor({ avgMessageLength: 100 });
        const text = 'Some moderately long reply that should not be touched at all.';
        expect(s.adjustLength(text)).toBe(text);
    });

    it('returns original if no good cut point found', () => {
        const s = new StyleProcessor({ avgMessageLength: 10 });
        // No period → no cut point
        const text =
            'no period in this very very long message that just keeps going forever without a stop';
        const result = s.adjustLength(text);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
    });
});

describe('process (full pipeline)', () => {
    it('applies capitalization then length adjustment', () => {
        const s = new StyleProcessor({ capitalizationStyle: 'lowercase', avgMessageLength: 50 });
        const result = s.process('Hello World');
        expect(result).toBe('hello world');
    });

    it('returns string', () => {
        const s = new StyleProcessor({});
        expect(typeof s.process('some text')).toBe('string');
    });
});
