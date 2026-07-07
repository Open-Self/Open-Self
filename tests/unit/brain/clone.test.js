/**
 * CloneBrain — parseSoulMd extracts all 9 keys, buildSystemPrompt structure
 */
import { describe, it, expect } from 'vitest';
import { CloneBrain, loadSoul } from '../../../src/brain/clone.js';
import { readFixture } from '../../helpers/fixture-loader.js';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const SOUL_MD = readFixture('soul-minimal.md');

describe('CloneBrain constructor + parseSoulMd', () => {
    it('constructs without throwing', () => {
        expect(() => new CloneBrain(SOUL_MD)).not.toThrow();
    });

    it('extracts name from SOUL.md', () => {
        const brain = new CloneBrain(SOUL_MD);
        expect(brain.soul.name).toBe('TestUser');
    });

    it('extracts language from SOUL.md', () => {
        const brain = new CloneBrain(SOUL_MD);
        expect(brain.soul.language).toBe('Vietnamese');
    });

    it('extracts avgMessageLength from SOUL.md', () => {
        const brain = new CloneBrain(SOUL_MD);
        expect(brain.soul.avgMessageLength).toBe('25');
    });

    it('extracts emojiFrequency from SOUL.md', () => {
        const brain = new CloneBrain(SOUL_MD);
        expect(brain.soul.emojiFrequency).toBe('moderate');
    });

    it('extracts catchphrases from SOUL.md', () => {
        const brain = new CloneBrain(SOUL_MD);
        expect(brain.soul.catchphrases).toContain('ê');
    });

    it('extracts abbreviations from SOUL.md', () => {
        const brain = new CloneBrain(SOUL_MD);
        expect(brain.soul.abbreviations).toContain('oke');
    });

    it('extracts avoidTopics from SOUL.md', () => {
        const brain = new CloneBrain(SOUL_MD);
        expect(brain.soul.avoidTopics).toContain('politics');
    });

    it('extracts unsureFallback from SOUL.md', () => {
        const brain = new CloneBrain(SOUL_MD);
        expect(brain.soul.unsureFallback).toBeTruthy();
    });

    it('extracts neverShare from SOUL.md', () => {
        const brain = new CloneBrain(SOUL_MD);
        expect(brain.soul.neverShare).toBeTruthy();
    });

    it('rawContent is the original soul string', () => {
        const brain = new CloneBrain(SOUL_MD);
        expect(brain.soul.rawContent).toBe(SOUL_MD);
    });
});

describe('buildSystemPrompt', () => {
    it('contains the soul name', () => {
        const brain = new CloneBrain(SOUL_MD);
        const prompt = brain.buildSystemPrompt({ name: 'Alice', channel: 'whatsapp' });
        expect(prompt).toContain('TestUser');
    });

    it('contains the contact name', () => {
        const brain = new CloneBrain(SOUL_MD);
        const prompt = brain.buildSystemPrompt({ name: 'Alice', channel: 'whatsapp' });
        expect(prompt).toContain('Alice');
    });

    it('contains the channel name', () => {
        const brain = new CloneBrain(SOUL_MD);
        const prompt = brain.buildSystemPrompt({ name: 'Bob', channel: 'telegram' });
        expect(prompt).toContain('telegram');
    });

    it('contains CRITICAL RULES section', () => {
        const brain = new CloneBrain(SOUL_MD);
        const prompt = brain.buildSystemPrompt({});
        expect(prompt).toContain('CRITICAL RULES');
    });

    it('contains NEVER say as an AI directive', () => {
        const brain = new CloneBrain(SOUL_MD);
        const prompt = brain.buildSystemPrompt({});
        expect(prompt).toMatch(/NEVER.*AI/);
    });

    it('includes ragContext when provided', () => {
        const brain = new CloneBrain(SOUL_MD);
        const prompt = brain.buildSystemPrompt({}, '', 'past convo about coffee');
        expect(prompt).toContain('past convo about coffee');
    });

    it('includes recentHistory when provided', () => {
        const brain = new CloneBrain(SOUL_MD);
        const prompt = brain.buildSystemPrompt({}, 'recent: hey', '');
        expect(prompt).toContain('recent: hey');
    });

    it('contains ||| format instruction for multiple messages', () => {
        const brain = new CloneBrain(SOUL_MD);
        const prompt = brain.buildSystemPrompt({});
        expect(prompt).toContain('|||');
    });
});

describe('loadSoul', () => {
    it('throws a NO_SOUL error when SOUL.md is missing', () => {
        const dir = mkdtempSync(join(tmpdir(), 'openself-nosoul-'));
        try {
            expect(() => loadSoul(dir)).toThrowError(/SOUL\.md not found/);
            let code;
            try {
                loadSoul(dir);
            } catch (e) {
                code = e.code;
            }
            expect(code).toBe('NO_SOUL');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('reads SOUL.md content when present', () => {
        const dir = mkdtempSync(join(tmpdir(), 'openself-soul-'));
        try {
            writeFileSync(join(dir, 'SOUL.md'), '# SOUL\n- Name: Zed\n', 'utf-8');
            expect(loadSoul(dir)).toContain('Name: Zed');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
