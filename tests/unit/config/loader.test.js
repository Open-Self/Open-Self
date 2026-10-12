/**
 * loadConfig — defaults, YAML file override, env override, deep merge
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadConfig } from '../../../src/config/loader.js';

let dir;
const savedEnv = {};
const ENV_KEYS = ['LLM_PROVIDER', 'LLM_MODEL', 'DATA_DIR'];

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'openself-cfg-'));
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
    for (const k of ENV_KEYS) {
        if (savedEnv[k] === undefined) delete process.env[k];
        else process.env[k] = savedEnv[k];
    }
    rmSync(dir, { recursive: true, force: true });
});

describe('loadConfig defaults', () => {
    it('returns built-in defaults when no config file is found', () => {
        const cfg = loadConfig(join(dir, 'missing.yml'));
        expect(cfg.llm.provider).toBe('anthropic');
        expect(cfg.llm.maxTokens).toBe(500);
        expect(cfg.safety.safeMode).toBe(true);
    });
});

describe('loadConfig file override', () => {
    it('merges a YAML file over defaults (deep merge keeps untouched keys)', () => {
        const p = join(dir, 'openself.yml');
        writeFileSync(p, 'llm:\n  provider: openai\n  maxTokens: 999\n', 'utf-8');
        const cfg = loadConfig(p);
        expect(cfg.llm.provider).toBe('openai');
        expect(cfg.llm.maxTokens).toBe(999);
        // untouched default still present
        expect(cfg.safety.safeMode).toBe(true);
    });

    it('falls back to defaults when the YAML is invalid', () => {
        const p = join(dir, 'bad.yml');
        writeFileSync(p, 'llm: [::: not valid', 'utf-8');
        const cfg = loadConfig(p);
        expect(cfg.llm.provider).toBe('anthropic');
    });
});

describe('loadConfig env override', () => {
    it('env vars take precedence over file and defaults', () => {
        const p = join(dir, 'openself.yml');
        writeFileSync(p, 'llm:\n  provider: openai\n', 'utf-8');
        process.env.LLM_PROVIDER = 'deepseek';
        process.env.LLM_MODEL = 'custom-model';
        process.env.DATA_DIR = '/tmp/custom-data';
        const cfg = loadConfig(p);
        expect(cfg.llm.provider).toBe('deepseek');
        expect(cfg.llm.model).toBe('custom-model');
        expect(cfg.data.dir).toBe('/tmp/custom-data');
    });
});
