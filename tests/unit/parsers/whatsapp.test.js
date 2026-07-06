/**
 * WhatsApp parser — multiline, system-msg skip, edge cases
 */
import { describe, it, expect } from 'vitest';
import {
    parseWhatsAppContent,
    splitBySender,
    groupIntoConversations,
    detectUserName,
} from '../../../src/parsers/whatsapp.js';
import { readFixture, fixturePath } from '../../helpers/fixture-loader.js';
import { parseWhatsApp } from '../../../src/parsers/whatsapp.js';

const TINY_FIXTURE = readFixture('whatsapp-tiny.txt');

describe('parseWhatsAppContent', () => {
    it('parses normal messages from fixture', () => {
        const messages = parseWhatsAppContent(TINY_FIXTURE);
        expect(messages.length).toBeGreaterThan(0);
        // System message "Messages and calls are end-to-end encrypted" is skipped
        const senders = messages.map((m) => m.sender);
        expect(senders).not.toContain(undefined);
    });

    it('skips system messages (end-to-end encrypted notice)', () => {
        const messages = parseWhatsAppContent(TINY_FIXTURE);
        const hasSystemMsg = messages.some(
            (m) => m.text && m.text.toLowerCase().includes('end-to-end encrypted'),
        );
        expect(hasSystemMsg).toBe(false);
    });

    it('each message has date, time, sender, text', () => {
        const messages = parseWhatsAppContent(TINY_FIXTURE);
        for (const msg of messages) {
            expect(msg).toHaveProperty('date');
            expect(msg).toHaveProperty('time');
            expect(msg).toHaveProperty('sender');
            expect(msg).toHaveProperty('text');
        }
    });

    it('handles multiline message continuation', () => {
        const content =
            '12/01/2024, 09:15 - Harvey: line one\ncontinuation here\n12/01/2024, 09:16 - Bob: reply';
        const messages = parseWhatsAppContent(content);
        const harveyMsg = messages.find((m) => m.sender === 'Harvey');
        expect(harveyMsg.text).toContain('line one');
        expect(harveyMsg.text).toContain('continuation here');
    });

    it('filters out <Media omitted> messages', () => {
        const content = '12/01/2024, 09:15 - Harvey: <Media omitted>\n12/01/2024, 09:16 - Bob: ok';
        const messages = parseWhatsAppContent(content);
        const mediaMsg = messages.find((m) => m.text.includes('<Media omitted>'));
        expect(mediaMsg).toBeUndefined();
    });

    it('returns empty array for empty content', () => {
        expect(parseWhatsAppContent('')).toEqual([]);
    });

    it('parses sender names correctly from fixture', () => {
        const messages = parseWhatsAppContent(TINY_FIXTURE);
        const senders = new Set(messages.map((m) => m.sender));
        expect(senders.has('Harvey')).toBe(true);
        expect(senders.has('Bob')).toBe(true);
    });
});

describe('parseWhatsApp (file)', () => {
    it('reads and parses fixture file', () => {
        const messages = parseWhatsApp(fixturePath('whatsapp-tiny.txt'));
        expect(Array.isArray(messages)).toBe(true);
        expect(messages.length).toBeGreaterThan(0);
    });
});

describe('splitBySender', () => {
    it('splits messages into yours and others', () => {
        const messages = parseWhatsAppContent(TINY_FIXTURE);
        const { yours, others } = splitBySender(messages, 'Harvey');
        expect(yours.every((m) => m.sender === 'Harvey')).toBe(true);
        expect(others.every((m) => m.sender !== 'Harvey')).toBe(true);
    });
});

describe('detectUserName', () => {
    it('returns most frequent sender as likelyUser', () => {
        const messages = [
            { sender: 'Alice', text: 'hi' },
            { sender: 'Alice', text: 'hey' },
            { sender: 'Bob', text: 'hello' },
        ];
        const { likelyUser } = detectUserName(messages);
        expect(likelyUser).toBe('Alice');
    });

    it('returns Unknown for empty messages', () => {
        const { likelyUser } = detectUserName([]);
        expect(likelyUser).toBe('Unknown');
    });
});

describe('groupIntoConversations', () => {
    it('pairs others messages with your replies', () => {
        const messages = [
            { sender: 'Bob', text: 'sup', date: '01/01/2024', time: '09:00' },
            { sender: 'Me', text: 'hey', date: '01/01/2024', time: '09:01' },
        ];
        const convos = groupIntoConversations(messages, 'Me');
        expect(convos.length).toBe(1);
        expect(convos[0].theirMessage).toBe('sup');
        expect(convos[0].yourReply).toBe('hey');
    });
});
