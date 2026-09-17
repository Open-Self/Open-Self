import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccessAudit, AUDIT_CHAIN_GENESIS } from '../../../src/context/access-audit.js';

describe('tamper-evident audit chain', () => {
    let audit;
    let directory;
    afterEach(() => {
        audit?.close();
        audit = null;
        if (directory) rmSync(directory, { recursive: true, force: true });
        directory = undefined;
    });

    it('chains completed events and verifies cleanly', () => {
        audit = new AccessAudit({ dbPath: ':memory:' });
        const first = audit.begin('agent-a', 'openself_search_memory');
        audit.finish(first, 'allowed');
        const second = audit.begin('agent-b', 'openself_remember');
        audit.finish(second, 'denied');

        const chain = audit.verify();
        expect(chain.ok).toBe(true);
        expect(chain.checked).toBe(2);
        expect(chain.tip).toMatch(/^[a-f0-9]{64}$/);

        const [newest, oldest] = audit.list();
        expect(oldest.prevHash).toBe(AUDIT_CHAIN_GENESIS);
        expect(newest.prevHash).toBe(oldest.entryHash);
    });

    it('detects row tampering and mid-chain deletion', () => {
        audit = new AccessAudit({ dbPath: ':memory:' });
        for (let index = 0; index < 3; index++) {
            const id = audit.begin('agent', `tool-${index}`);
            audit.finish(id, 'allowed');
        }
        // Tamper: flip a historical outcome.
        audit.db.prepare("UPDATE access_events SET outcome = 'denied' WHERE id = 1").run();
        const broken = audit.verify();
        expect(broken.ok).toBe(false);
        expect(broken.brokenAt).toBe(1);
    });

    it('detects deletion of a chained event', () => {
        audit = new AccessAudit({ dbPath: ':memory:' });
        for (let index = 0; index < 3; index++) {
            const id = audit.begin('agent', `tool-${index}`);
            audit.finish(id, 'allowed');
        }
        audit.db.prepare('DELETE FROM access_events WHERE id = 2').run();
        const chain = audit.verify();
        expect(chain.ok).toBe(false);
        expect(chain.brokenAt).toBe(3);
    });

    it('treats interrupted attempts as pending, not chain breaks', () => {
        audit = new AccessAudit({ dbPath: ':memory:' });
        const first = audit.begin('agent', 'tool-a');
        audit.finish(first, 'allowed');
        audit.begin('agent', 'tool-b'); // crashed before finish
        const third = audit.begin('agent', 'tool-c');
        audit.finish(third, 'allowed');
        const chain = audit.verify();
        expect(chain.ok).toBe(true);
        expect(chain.pending).toBe(1);
        expect(chain.checked).toBe(2);
    });

    it('keeps the surviving suffix verifiable after retention pruning', () => {
        audit = new AccessAudit({ dbPath: ':memory:', maxEntries: 3 });
        for (let index = 0; index < 5; index++) {
            const id = audit.begin('agent', `tool-${index}`);
            audit.finish(id, 'allowed');
        }
        const events = audit.list({ limit: 10 });
        expect(events.length).toBe(3);
        const chain = audit.verify();
        expect(chain.ok).toBe(true);
        expect(chain.checked).toBe(3);
    });

    it('reports legacy unchained rows without failing verification', { timeout: 30_000 }, () => {
        directory = mkdtempSync(join(tmpdir(), 'openself-audit-'));
        const dbPath = join(directory, 'audit.db');
        // Build a pre-chain database: no hash columns, no audit_meta.
        const legacyDb = new Database(dbPath);
        legacyDb.exec(`CREATE TABLE access_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            occurred_at TEXT NOT NULL,
            client TEXT NOT NULL,
            tool TEXT NOT NULL,
            outcome TEXT NOT NULL CHECK(outcome IN ('attempted','allowed','denied','error'))
        )`);
        legacyDb
            .prepare(
                'INSERT INTO access_events (occurred_at, client, tool, outcome) VALUES (?, ?, ?, ?)',
            )
            .run(new Date().toISOString(), 'old-agent', 'openself_search_memory', 'allowed');
        legacyDb.close();

        const readonly = new AccessAudit({ dbPath, readonly: true });
        try {
            const events = readonly.list();
            expect(events).toHaveLength(1);
            expect(events[0].entryHash).toBeUndefined();
            const chain = readonly.verify();
            expect(chain.ok).toBe(true);
            expect(chain.legacy).toBe(1);
            expect(chain.checked).toBe(0);
        } finally {
            readonly.close();
        }
        // Opening writable upgrades the schema in place.
        audit = new AccessAudit({ dbPath });
        const id = audit.begin('agent', 'new-tool');
        audit.finish(id, 'allowed');
        const chain = audit.verify();
        expect(chain.ok).toBe(true);
        expect(chain.legacy).toBe(1);
        expect(chain.checked).toBe(1);
    });

    it('readonly mode lists and verifies without mutating', { timeout: 30_000 }, () => {
        directory = mkdtempSync(join(tmpdir(), 'openself-audit-'));
        const dbPath = join(directory, 'audit.db');
        audit = new AccessAudit({ dbPath });
        const id = audit.begin('agent', 'tool');
        audit.finish(id, 'allowed');
        audit.close();

        const readonly = new AccessAudit({ dbPath, readonly: true });
        try {
            expect(readonly.list()).toHaveLength(1);
            expect(readonly.verify().ok).toBe(true);
            expect(() => readonly.begin('x', 'y')).toThrow('read-only');
            expect(() => readonly.clear()).toThrow('read-only');
        } finally {
            readonly.close();
        }
        audit = null;
    });

    it('exports JSONL for external archival', () => {
        audit = new AccessAudit({ dbPath: ':memory:' });
        const id = audit.begin('agent', 'tool');
        audit.finish(id, 'allowed');
        const lines = audit.toJSONL().trim().split('\n');
        expect(lines).toHaveLength(1);
        const parsed = JSON.parse(lines[0]);
        expect(parsed.entryHash).toMatch(/^[a-f0-9]{64}$/);
        expect(parsed.outcome).toBe('allowed');
    });
});
