/**
 * ConversationMemory — per-contact session window, context formatting, persistence
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ConversationMemory } from '../../../src/memory/conversation.js';

let dir;
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'openself-conv-'));
});
afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

describe('ConversationMemory.addExchange + getRecentContext', () => {
    it('returns empty string for an unknown contact', () => {
        const mem = new ConversationMemory(dir);
        expect(mem.getRecentContext('Nobody')).toBe('');
    });

    it('formats stored exchanges as "contact / You" pairs', () => {
        const mem = new ConversationMemory(dir);
        mem.addExchange('Alice', 'hi', 'ê');
        const ctx = mem.getRecentContext('Alice');
        expect(ctx).toContain('Alice: hi');
        expect(ctx).toContain('You: ê');
    });

    it('caps returned exchanges at maxExchanges', () => {
        const mem = new ConversationMemory(dir);
        for (let i = 0; i < 5; i++) mem.addExchange('Bob', `m${i}`, `r${i}`);
        const ctx = mem.getRecentContext('Bob', 2);
        expect(ctx).toContain('m3');
        expect(ctx).toContain('m4');
        expect(ctx).not.toContain('m0');
    });

    it('keeps only the last 20 exchanges in the session window', () => {
        const mem = new ConversationMemory(dir);
        for (let i = 0; i < 25; i++) mem.addExchange('Carol', `m${i}`, `r${i}`);
        const ctx = mem.getRecentContext('Carol', 100);
        expect(ctx).not.toContain('m4'); // dropped
        expect(ctx).toContain('m24'); // kept
    });
});

describe('ConversationMemory.getActiveContacts + clearSession', () => {
    it('lists contacts with message counts, most recent first', () => {
        const mem = new ConversationMemory(dir);
        mem.addExchange('A', 'x', 'y');
        mem.addExchange('A', 'x2', 'y2');
        mem.addExchange('B', 'z', 'w');
        const contacts = mem.getActiveContacts();
        expect(contacts.map((c) => c.name).sort()).toEqual(['A', 'B']);
        expect(contacts.find((c) => c.name === 'A').messageCount).toBe(2);
    });

    it('clearSession drops a contact from active list', () => {
        const mem = new ConversationMemory(dir);
        mem.addExchange('A', 'x', 'y');
        mem.clearSession('A');
        expect(mem.getActiveContacts()).toHaveLength(0);
        expect(mem.getRecentContext('A')).toBe('');
    });
});

describe('ConversationMemory persistence', () => {
    it('appends exchanges to memory.md and summarizes them', () => {
        const mem = new ConversationMemory(dir);
        mem.addExchange('A', 'hi there', 'oke');
        mem.addExchange('A', 'again', 'ừ');
        expect(existsSync(join(dir, 'memory.md'))).toBe(true);
        expect(readFileSync(join(dir, 'memory.md'), 'utf-8')).toContain('hi there');

        const summary = mem.getMemorySummary();
        expect(summary.totalExchanges).toBe(2);
        expect(summary.sizeBytes).toBeGreaterThan(0);
    });

    it('getMemorySummary returns null when no memory file exists', () => {
        const mem = new ConversationMemory(dir);
        expect(mem.getMemorySummary()).toBeNull();
    });
});
