import Database from 'better-sqlite3';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    parseBrowserSource,
    parseCalendarSource,
    parseEmailSource,
} from '../../../src/context/capture-parsers.js';

describe('structured capture parsers', () => {
    let tempDir;
    const options = { scope: 'personal/source', sensitivity: 'private', limit: 100 };

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), 'openself-capture-parsers-'));
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    it('parses unfolded ICS events with stable provenance and timestamps', () => {
        const path = join(tempDir, 'calendar.ics');
        writeFileSync(
            path,
            [
                'BEGIN:VCALENDAR',
                'BEGIN:VEVENT',
                'UID:planning-1',
                'DTSTART:20260820T090000Z',
                'DTEND:20260820T100000Z',
                'SUMMARY:Product planning',
                'LOCATION:Room 4',
                'DESCRIPTION:Review the roadmap and',
                ' next release',
                'END:VEVENT',
                'END:VCALENDAR',
            ].join('\r\n'),
        );

        const records = parseCalendarSource(path, options);

        expect(records).toHaveLength(1);
        expect(records[0]).toMatchObject({
            key: 'planning-1:',
            memory: {
                type: 'event',
                summary: 'Product planning',
                occurredAt: '2026-08-20T09:00:00.000Z',
                source: { kind: 'calendar', title: 'calendar.ics' },
            },
        });
        expect(records[0].memory.content).toContain('Review the roadmap andnext release');
    });

    it('parses EML headers and quoted-printable bodies', () => {
        const path = join(tempDir, 'message.eml');
        writeFileSync(
            path,
            [
                'Message-ID: <ship-42@example.com>',
                'Date: Thu, 20 Aug 2026 09:30:00 +0000',
                'From: Minh <minh@example.com>',
                'To: Team <team@example.com>',
                'Subject: =?UTF-8?Q?Release=20ready?=',
                'Content-Type: text/plain; charset=UTF-8',
                'Content-Transfer-Encoding: quoted-printable',
                '',
                'All checks passed=2E',
            ].join('\r\n'),
        );

        const [record] = parseEmailSource(path, options);

        expect(record.key).toBe('ship-42@example.com');
        expect(record.memory).toMatchObject({
            summary: 'Release ready',
            occurredAt: '2026-08-20T09:30:00.000Z',
            source: { kind: 'email', title: 'message.eml' },
        });
        expect(record.memory.content).toContain('All checks passed.');
    });

    it('parses MBOX directories and limits the record count', () => {
        const directory = join(tempDir, 'mail');
        mkdirSync(directory);
        writeFileSync(
            join(directory, 'inbox.mbox'),
            [
                'From sender@example.com Thu Aug 20 09:30:00 2026',
                'Message-ID: <one@example.com>',
                'Subject: One',
                '',
                'First message',
                'From sender@example.com Thu Aug 20 10:30:00 2026',
                'Message-ID: <two@example.com>',
                'Subject: Two',
                '',
                'Second message',
            ].join('\n'),
        );

        expect(parseEmailSource(directory, { ...options, limit: 1 })).toHaveLength(1);
    });

    it('parses bookmark HTML while removing URL credentials, query, and fragment', () => {
        const path = join(tempDir, 'bookmarks.html');
        writeFileSync(
            path,
            '<A HREF="https://user:pass@example.com/docs?token=secret#part" ADD_DATE="1787216400">Docs &amp; API</A>',
        );

        const [record] = parseBrowserSource(path, options);

        expect(record.memory.content).toBe('Docs & API\nURL: https://example.com/docs');
        expect(record.memory.occurredAt).toMatch(/^2026-/);
        expect(record.memory.source.kind).toBe('browser-bookmark');
    });

    it('parses nested Chromium bookmark JSON', () => {
        const path = join(tempDir, 'bookmarks.json');
        writeFileSync(
            path,
            JSON.stringify({
                roots: {
                    bookmark_bar: {
                        children: [
                            {
                                type: 'url',
                                name: 'OpenSelf',
                                url: 'https://openself.dev/?ref=local',
                            },
                        ],
                    },
                },
            }),
        );

        const [record] = parseBrowserSource(path, options);
        expect(record.key).toBe('bookmark:https://openself.dev/');
    });

    it('reads Chromium History SQLite and normalizes its epoch', () => {
        const path = join(tempDir, 'History');
        const db = new Database(path);
        db.exec(
            'CREATE TABLE urls (url TEXT, title TEXT, last_visit_time INTEGER, visit_count INTEGER)',
        );
        const unixMilliseconds = Date.parse('2026-08-20T12:00:00.000Z');
        const chromiumMicroseconds = (unixMilliseconds + 11_644_473_600_000) * 1_000;
        db.prepare('INSERT INTO urls VALUES (?, ?, ?, ?)').run(
            'https://example.com/private?session=hidden',
            'Example',
            chromiumMicroseconds,
            3,
        );
        db.close();

        const [record] = parseBrowserSource(path, options);

        expect(record.memory.content).toBe('Example\nURL: https://example.com/private');
        expect(record.memory.occurredAt).toBe('2026-08-20T12:00:00.000Z');
    });
});
