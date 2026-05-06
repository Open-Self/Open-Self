/**
 * SVG Badge generator — structure, score grades, XSS escaping
 */
import { describe, it, expect } from 'vitest';
import { generateBadge } from '../../../src/web/badge.js';

describe('generateBadge', () => {
    it('returns a string starting with <svg', () => {
        const svg = generateBadge('TestUser', 85);
        expect(svg.trim()).toMatch(/^<svg/);
    });

    it('contains the name in output', () => {
        const svg = generateBadge('Alice', 80);
        expect(svg).toContain('Alice');
    });

    it('contains the score in output', () => {
        const svg = generateBadge('Bob', 72);
        expect(svg).toContain('72');
    });

    it('grade A+ for score >= 95', () => {
        const svg = generateBadge('X', 95);
        expect(svg).toContain('A+');
    });

    it('grade A for score 90-94', () => {
        const svg = generateBadge('X', 90);
        expect(svg).toContain('A');
    });

    it('grade B+ for score 80-84', () => {
        const svg = generateBadge('X', 80);
        expect(svg).toContain('B+');
    });

    it('grade C for score < 70', () => {
        const svg = generateBadge('X', 50);
        expect(svg).toContain('C');
    });

    it('uses green color for score >= 80', () => {
        const svg = generateBadge('X', 85);
        expect(svg).toContain('#22c55e');
    });

    it('uses yellow color for score 60-79', () => {
        const svg = generateBadge('X', 65);
        expect(svg).toContain('#eab308');
    });

    it('uses red color for score < 60', () => {
        const svg = generateBadge('X', 40);
        expect(svg).toContain('#ef4444');
    });

    it('uses dark background when dark option set', () => {
        const svg = generateBadge('X', 80, { dark: true });
        expect(svg).toContain('#1a1a2e');
    });

    it('contains xmlns attribute (valid SVG)', () => {
        const svg = generateBadge('X', 80);
        expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    });

    it('score 0 still generates valid SVG', () => {
        const svg = generateBadge('Zero', 0);
        expect(svg).toContain('<svg');
        expect(svg).toContain('Zero');
    });
});
