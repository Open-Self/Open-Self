/**
 * Generic parser — freeform text, section extraction
 */
import { describe, it, expect } from 'vitest';
import { parseGenericContent } from '../../../src/parsers/generic.js';

describe('parseGenericContent', () => {
    it('returns type=manual and rawContent', () => {
        const result = parseGenericContent('hello world');
        expect(result.type).toBe('manual');
        expect(result.rawContent).toBe('hello world');
    });

    it('returns sections object', () => {
        const result = parseGenericContent('some text\nmore text');
        expect(result).toHaveProperty('sections');
        expect(typeof result.sections).toBe('object');
    });

    it('extracts markdown heading as section key', () => {
        const content = '## Personality\n- likes coffee\n- reads books';
        const result = parseGenericContent(content);
        expect(result.sections).toHaveProperty('personality');
        expect(result.sections.personality.length).toBeGreaterThan(0);
    });

    it('places lines before any heading in general section', () => {
        const content = 'this is general info\nmore general';
        const result = parseGenericContent(content);
        expect(result.sections).toHaveProperty('general');
        expect(result.sections.general).toContain('this is general info');
    });

    it('handles colon-style section headers', () => {
        const content = 'Style:\nlowercase always\nno punctuation';
        const result = parseGenericContent(content);
        // Colon-style "Style:" is matched as a section header
        expect(Object.keys(result.sections).some(k => k.includes('style'))).toBe(true);
    });

    it('filters blank lines (does not add empty strings)', () => {
        const content = '## Voice\n\nsome trait\n\nanother trait';
        const result = parseGenericContent(content);
        const lines = result.sections['voice'] || [];
        const hasEmpty = lines.some(l => l.trim() === '');
        expect(hasEmpty).toBe(false);
    });

    it('handles empty input gracefully', () => {
        const result = parseGenericContent('');
        expect(result.type).toBe('manual');
        expect(typeof result.sections).toBe('object');
    });
});
