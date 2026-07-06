/**
 * Telegram parser — JSON variants (string text, array text entities)
 */
import { describe, it, expect } from 'vitest';
import { parseTelegram } from '../../../src/parsers/telegram.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function writeTmp(name, data) {
    const dir = join(tmpdir(), 'openself-test-telegram');
    mkdirSync(dir, { recursive: true });
    const p = join(dir, name);
    writeFileSync(p, JSON.stringify(data), 'utf-8');
    return p;
}

describe('parseTelegram', () => {
    it('parses messages array with string text', () => {
        const data = {
            messages: [
                { type: 'message', from: 'Alice', date: '2024-01-12T09:00:00', text: 'hello' },
                { type: 'message', from: 'Bob', date: '2024-01-12T09:01:00', text: 'hi there' },
            ],
        };
        const p = writeTmp('basic.json', data);
        const messages = parseTelegram(p);
        expect(messages.length).toBe(2);
        expect(messages[0].sender).toBe('Alice');
        expect(messages[0].text).toBe('hello');
        expect(messages[1].sender).toBe('Bob');
    });

    it('parses array-format text entities', () => {
        const data = {
            messages: [
                {
                    type: 'message',
                    from: 'Alice',
                    date: '2024-01-12T09:00:00',
                    text: ['hello ', { text: 'world', type: 'bold' }],
                },
            ],
        };
        const p = writeTmp('entities.json', data);
        const messages = parseTelegram(p);
        expect(messages.length).toBe(1);
        expect(messages[0].text).toBe('hello world');
    });

    it('skips non-message type entries', () => {
        const data = {
            messages: [
                { type: 'service', from: 'Alice', date: '2024-01-12T09:00:00', text: 'joined' },
                { type: 'message', from: 'Bob', date: '2024-01-12T09:01:00', text: 'hi' },
            ],
        };
        const p = writeTmp('service.json', data);
        const messages = parseTelegram(p);
        expect(messages.length).toBe(1);
        expect(messages[0].sender).toBe('Bob');
    });

    it('skips empty/blank text messages', () => {
        const data = {
            messages: [
                { type: 'message', from: 'Alice', date: '2024-01-12T09:00:00', text: '   ' },
                { type: 'message', from: 'Bob', date: '2024-01-12T09:01:00', text: 'real msg' },
            ],
        };
        const p = writeTmp('blanks.json', data);
        const messages = parseTelegram(p);
        expect(messages.length).toBe(1);
        expect(messages[0].text).toBe('real msg');
    });

    it('handles chats.list nested export format', () => {
        const data = {
            chats: {
                list: [
                    {
                        messages: [
                            { type: 'message', from: 'Alice', date: '2024-01-12T09:00:00', text: 'nested' },
                        ],
                    },
                ],
            },
        };
        const p = writeTmp('nested.json', data);
        const messages = parseTelegram(p);
        expect(messages.length).toBe(1);
        expect(messages[0].text).toBe('nested');
    });

    it('returns empty array for empty messages list', () => {
        const data = { messages: [] };
        const p = writeTmp('empty.json', data);
        const messages = parseTelegram(p);
        expect(messages).toEqual([]);
    });

    it('each message has date, time, sender, text', () => {
        const data = {
            messages: [
                { type: 'message', from: 'Alice', date: '2024-01-12T09:15:00', text: 'check' },
            ],
        };
        const p = writeTmp('shape.json', data);
        const [msg] = parseTelegram(p);
        expect(msg).toHaveProperty('date');
        expect(msg).toHaveProperty('time');
        expect(msg).toHaveProperty('sender');
        expect(msg).toHaveProperty('text');
    });
});
