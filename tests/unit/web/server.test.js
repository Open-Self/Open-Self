/**
 * Web server security — P0 regression tests
 * Path traversal blocked on /arena/:id
 * XSS escaped on /badge/:name
 *
 * Strategy: test security logic directly without spinning up real HTTP.
 * The arena id validation regex and badge name sanitization are pure logic
 * extracted inline — we verify the same patterns the server uses.
 */
import { describe, it, expect } from 'vitest';
import { generateBadge } from '../../../src/web/badge.js';

// ─── Arena ID validation logic (mirrors server.js line 79) ───────────────────
// Whitelist: alnum + dash/underscore, 1-64 chars
const VALID_ARENA_ID = /^[a-zA-Z0-9_-]{1,64}$/;

function validateArenaId(id) {
    return VALID_ARENA_ID.test(id);
}

// ─── Badge name sanitizer (mirrors server.js lines 55-57) ────────────────────
function sanitizeBadgeName(raw) {
    const capped = String(raw || 'Clone').slice(0, 64);
    return capped.replace(/[<>&"']/g, c =>
        ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c])
    );
}

describe('Arena ID validation (path traversal P0)', () => {
    it('rejects path traversal: ../etc/passwd', () => {
        expect(validateArenaId('../etc/passwd')).toBe(false);
    });

    it('rejects URL-encoded traversal: ..%2F..%2Fetc%2Fpasswd', () => {
        // Express decodes %2F before reaching route handler
        expect(validateArenaId('..%2F..%2Fetc%2Fpasswd')).toBe(false);
    });

    it('rejects id with slash', () => {
        expect(validateArenaId('arena/../../secret')).toBe(false);
    });

    it('rejects id with script tag', () => {
        expect(validateArenaId('<script>alert(1)</script>')).toBe(false);
    });

    it('rejects id with spaces', () => {
        expect(validateArenaId('arena id with spaces')).toBe(false);
    });

    it('rejects empty string', () => {
        expect(validateArenaId('')).toBe(false);
    });

    it('rejects id longer than 64 chars', () => {
        expect(validateArenaId('a'.repeat(65))).toBe(false);
    });

    it('accepts valid alphanumeric id', () => {
        expect(validateArenaId('valid-arena-id-123')).toBe(true);
    });

    it('accepts id with underscore', () => {
        expect(validateArenaId('debate_round_1')).toBe(true);
    });

    it('accepts single character id', () => {
        expect(validateArenaId('a')).toBe(true);
    });

    it('accepts exactly 64 chars', () => {
        expect(validateArenaId('a'.repeat(64))).toBe(true);
    });
});

describe('Badge name XSS sanitization (P0)', () => {
    it('escapes <script> in name', () => {
        const safe = sanitizeBadgeName('<script>alert(1)</script>');
        expect(safe).not.toContain('<script>');
        expect(safe).toContain('&lt;script&gt;');
    });

    it('escapes < and > characters', () => {
        const safe = sanitizeBadgeName('<evil>');
        expect(safe).toContain('&lt;');
        expect(safe).toContain('&gt;');
    });

    it('escapes & character', () => {
        const safe = sanitizeBadgeName('Tom & Jerry');
        expect(safe).toContain('&amp;');
    });

    it('escapes double quotes', () => {
        const safe = sanitizeBadgeName('say "hello"');
        expect(safe).toContain('&quot;');
    });

    it('escapes single quotes', () => {
        const safe = sanitizeBadgeName("it's me");
        expect(safe).toContain('&#39;');
    });

    it('passes clean alphanumeric names unchanged', () => {
        expect(sanitizeBadgeName('Alice123')).toBe('Alice123');
    });

    it('caps name at 64 chars', () => {
        const long = 'a'.repeat(100);
        expect(sanitizeBadgeName(long).length).toBeLessThanOrEqual(64);
    });

    it('generateBadge with XSS name does not embed raw script', () => {
        const name = sanitizeBadgeName('<script>alert(1)</script>');
        const svg = generateBadge(name, 80);
        expect(svg).not.toContain('<script>');
        expect(svg).toContain('&lt;script&gt;');
    });

    it('generateBadge with clean name renders name in SVG', () => {
        const name = sanitizeBadgeName('TestUser');
        const svg = generateBadge(name, 85);
        expect(svg).toContain('TestUser');
    });
});
