import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { auditCommand } from '../../../src/cli/audit.js';
import { AccessAudit } from '../../../src/context/access-audit.js';

const dirs = [];
function tempDir() {
    const dir = mkdtempSync(join(tmpdir(), 'openself-audit-cli-'));
    dirs.push(dir);
    return dir;
}

afterEach(() => {
    while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

it('provides owner audit list/prune/clear commands with validated controls', () => {
    const dataDir = tempDir();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
        auditCommand('list', { dataDir });
        expect(JSON.parse(log.mock.calls.at(-1)[0])).toEqual([]);
        for (const action of ['prune', 'clear']) {
            auditCommand(action, { dataDir });
            expect(JSON.parse(log.mock.calls.at(-1)[0])).toEqual({ deleted: 0 });
        }
        expect(() => auditCommand('invalid', { dataDir })).toThrow('Use audit');
    } finally {
        log.mockRestore();
    }
});

describe('verify and export', () => {
    function seededDir() {
        const dataDir = tempDir();
        const audit = new AccessAudit({ dbPath: join(dataDir, 'mcp-audit.db') });
        const first = audit.begin('test', 'search_memory');
        audit.finish(first, 'allowed');
        const second = audit.begin('test', 'remember');
        audit.finish(second, 'denied');
        audit.close();
        return dataDir;
    }

    it('verifies an intact chain', { timeout: 30_000 }, () => {
        const dataDir = seededDir();
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        try {
            const result = auditCommand('verify', { dataDir, json: true });
            expect(result).toMatchObject({ ok: true, checked: 2 });
        } finally {
            log.mockRestore();
        }
    });

    it('exits non-zero when the chain is broken', { timeout: 30_000 }, () => {
        const dataDir = seededDir();
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        try {
            const audit = new AccessAudit({ dbPath: join(dataDir, 'mcp-audit.db') });
            audit.db.prepare("UPDATE access_events SET outcome = 'allowed' WHERE id = 2").run();
            audit.close();
            expect(() => auditCommand('verify', { dataDir })).toThrow(/failed/i);
        } finally {
            log.mockRestore();
        }
    });

    it('exports JSONL lines to stdout and to a file', { timeout: 30_000 }, () => {
        const dataDir = seededDir();
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        try {
            const out = join(dataDir, 'audit.jsonl');
            const result = auditCommand('export', { dataDir, file: out });
            expect(result.events).toBe(2);
            const lines = readFileSync(out, 'utf8').trim().split('\n');
            expect(lines).toHaveLength(2);
            const parsed = JSON.parse(lines[0]);
            expect(parsed.entryHash).toMatch(/^[0-9a-f]{64}$/);
            expect(parsed.prevHash).toBeTruthy();
        } finally {
            log.mockRestore();
            write.mockRestore();
        }
    });
});
