/**
 * Vocabulary Fingerprinter — stability + shape checks
 */
import { describe, it, expect } from 'vitest';
import { createFingerprint } from '../../../src/personality/fingerprint.js';

describe('createFingerprint', () => {
    it('returns all required keys', () => {
        const fp = createFingerprint(['hello world', 'how are you']);
        expect(fp).toHaveProperty('uniqueWords');
        expect(fp).toHaveProperty('avgWordLength');
        expect(fp).toHaveProperty('punctuationStyle');
        expect(fp).toHaveProperty('capitalizationStyle');
        expect(fp).toHaveProperty('messageEndStyle');
        expect(fp).toHaveProperty('questionFrequency');
        expect(fp).toHaveProperty('exclamationFrequency');
    });

    it('uniqueWords ratio is between 0 and 1', () => {
        const fp = createFingerprint(['hello world hello']);
        expect(fp.uniqueWords).toBeGreaterThanOrEqual(0);
        expect(fp.uniqueWords).toBeLessThanOrEqual(1);
    });

    it('uniqueWords = 1.0 when all words are unique', () => {
        const fp = createFingerprint(['alpha beta gamma']);
        expect(fp.uniqueWords).toBe(1);
    });

    it('uniqueWords < 1.0 when words repeat', () => {
        const fp = createFingerprint(['hello hello hello']);
        expect(fp.uniqueWords).toBeLessThan(1);
    });

    it('avgWordLength > 0 for non-empty input', () => {
        const fp = createFingerprint(['hello world']);
        expect(fp.avgWordLength).toBeGreaterThan(0);
    });

    it('returns 0 for empty input', () => {
        const fp = createFingerprint([]);
        expect(fp.uniqueWords).toBe(0);
        expect(fp.avgWordLength).toBe(0);
    });

    it('detects lowercase capitalization style', () => {
        const fp = createFingerprint(['all lowercase', 'nothing caps here', 'really low']);
        expect(fp.capitalizationStyle).toBe('lowercase');
    });

    it('detects Normal capitalization when mixed', () => {
        const fp = createFingerprint(['Hello World', 'Some Text Here', 'Mixed Case']);
        expect(fp.capitalizationStyle).toBe('Normal');
    });

    it('punctuationStyle counts questions correctly', () => {
        const fp = createFingerprint(['how are you?', 'what is this?']);
        expect(fp.punctuationStyle.questions).toBe(2);
    });

    it('questionFrequency is between 0 and 1', () => {
        const fp = createFingerprint(['hello?', 'world']);
        expect(fp.questionFrequency).toBeGreaterThanOrEqual(0);
        expect(fp.questionFrequency).toBeLessThanOrEqual(1);
    });

    it('is deterministic — same input produces same output', () => {
        const texts = ['hello world', 'how are you?', 'great!!!'];
        const fp1 = createFingerprint(texts);
        const fp2 = createFingerprint(texts);
        expect(fp1).toEqual(fp2);
    });

    it('messageEndStyle is an array', () => {
        const fp = createFingerprint(['hello.', 'world!']);
        expect(Array.isArray(fp.messageEndStyle)).toBe(true);
    });
});
