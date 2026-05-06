/**
 * OllamaProvider — fetch mock, request shape, error handling
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaProvider } from '../../../../src/brain/providers/ollama.js';

const mockFetch = vi.fn();

beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ message: { content: 'mocked ollama reply' } }),
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

describe('OllamaProvider', () => {
    it('name property is "ollama"', () => {
        const p = new OllamaProvider({});
        expect(p.name).toBe('ollama');
    });

    it('uses default baseURL when not provided', () => {
        const p = new OllamaProvider({});
        expect(p.baseURL).toBe('http://localhost:11434');
    });

    it('accepts custom baseURL', () => {
        const p = new OllamaProvider({ baseURL: 'http://custom:11434' });
        expect(p.baseURL).toBe('http://custom:11434');
    });

    it('chat() calls fetch with POST to /api/chat', async () => {
        const p = new OllamaProvider({});
        await p.chat('system prompt', 'user message');
        expect(mockFetch).toHaveBeenCalledOnce();
        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/api/chat');
        expect(opts.method).toBe('POST');
    });

    it('chat() sends system and user messages in body', async () => {
        const p = new OllamaProvider({});
        await p.chat('sys here', 'user here');
        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);
        expect(body.messages[0]).toEqual({ role: 'system', content: 'sys here' });
        expect(body.messages[1]).toEqual({ role: 'user', content: 'user here' });
    });

    it('chat() sets stream: false in body', async () => {
        const p = new OllamaProvider({});
        await p.chat('sys', 'msg');
        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);
        expect(body.stream).toBe(false);
    });

    it('chat() returns message content from response', async () => {
        const p = new OllamaProvider({});
        const result = await p.chat('sys', 'msg');
        expect(result).toBe('mocked ollama reply');
    });

    it('chat() throws descriptive error on non-ok response', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 503,
            statusText: 'Service Unavailable',
        });
        const p = new OllamaProvider({});
        await expect(p.chat('sys', 'msg')).rejects.toThrow(/Ollama API error/);
    });

    it('uses config.model in request body', async () => {
        const p = new OllamaProvider({ model: 'mistral' });
        await p.chat('sys', 'msg');
        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);
        expect(body.model).toBe('mistral');
    });

    it('passes Content-Type: application/json header', async () => {
        const p = new OllamaProvider({});
        await p.chat('sys', 'msg');
        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Content-Type']).toBe('application/json');
    });
});
