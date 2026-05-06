/**
 * LLM Provider Router — autoDetect, createProvider, env fallbacks
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createProvider, autoDetectProvider, PROVIDERS } from '../../../src/brain/router.js';

// Save and restore env per test
let savedEnv = {};
beforeEach(() => {
    savedEnv = {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
        OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
        LLM_PROVIDER: process.env.LLM_PROVIDER,
    };
    // Clear all provider env vars before each test
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.LLM_PROVIDER;
});
afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
});

describe('autoDetectProvider', () => {
    it('returns "anthropic" when ANTHROPIC_API_KEY is set', () => {
        process.env.ANTHROPIC_API_KEY = 'test-key';
        expect(autoDetectProvider()).toBe('anthropic');
    });

    it('returns "openai" when OPENAI_API_KEY is set (no anthropic)', () => {
        process.env.OPENAI_API_KEY = 'test-key';
        expect(autoDetectProvider()).toBe('openai');
    });

    it('returns "deepseek" when only DEEPSEEK_API_KEY set', () => {
        process.env.DEEPSEEK_API_KEY = 'test-key';
        expect(autoDetectProvider()).toBe('deepseek');
    });

    it('returns "ollama" when OLLAMA_BASE_URL set', () => {
        process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
        expect(autoDetectProvider()).toBe('ollama');
    });

    it('falls back to "ollama" when no env keys set', () => {
        // Current behavior: default fallback is ollama (not an error)
        expect(autoDetectProvider()).toBe('ollama');
    });

    it('anthropic takes precedence over openai when both set', () => {
        process.env.ANTHROPIC_API_KEY = 'a-key';
        process.env.OPENAI_API_KEY = 'o-key';
        expect(autoDetectProvider()).toBe('anthropic');
    });
});

describe('createProvider', () => {
    it('creates AnthropicProvider for "anthropic"', () => {
        const p = createProvider('anthropic', {});
        expect(p.name).toBe('anthropic');
    });

    it('creates OpenAIProvider for "openai"', () => {
        // OpenAI SDK throws if no apiKey — pass dummy via config
        const p = createProvider('openai', { apiKey: 'test-dummy-key' });
        expect(p.name).toBe('openai');
    });

    it('creates DeepSeekProvider for "deepseek"', () => {
        // DeepSeek uses OpenAI SDK internally — same requirement
        const p = createProvider('deepseek', { apiKey: 'test-dummy-key' });
        expect(p.name).toBe('deepseek');
    });

    it('creates OllamaProvider for "ollama"', () => {
        const p = createProvider('ollama', {});
        expect(p.name).toBe('ollama');
    });

    it('throws for unknown provider name', () => {
        expect(() => createProvider('unknown-llm', {})).toThrow(/Unknown LLM provider/);
    });

    it('is case-insensitive for provider name', () => {
        const p = createProvider('Anthropic', {});
        expect(p.name).toBe('anthropic');
    });

    it('uses LLM_PROVIDER env var when no name given', () => {
        process.env.LLM_PROVIDER = 'ollama';
        const p = createProvider(undefined, {});
        expect(p.name).toBe('ollama');
    });
});

describe('PROVIDERS map', () => {
    it('exports all 4 provider classes', () => {
        const keys = Object.keys(PROVIDERS);
        expect(keys).toContain('anthropic');
        expect(keys).toContain('openai');
        expect(keys).toContain('deepseek');
        expect(keys).toContain('ollama');
    });
});
