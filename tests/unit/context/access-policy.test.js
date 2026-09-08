import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AccessPolicy, loadMcpPolicy } from '../../../src/context/access-policy.js';
import { runContextMcpServer } from '../../../src/context/mcp.js';
import { AccessAudit } from '../../../src/context/access-audit.js';

describe('owner configuration and audit retention', () => {
    let directory;
    let audit;
    const settings = {
        scopes: ['project/atlas'],
        maxSensitivity: 'public',
        capabilities: ['read'],
    };
    beforeEach(() => {
        directory = mkdtempSync(join(tmpdir(), 'openself-policy-'));
    });
    afterEach(() => {
        audit?.close();
        audit = null;
        rmSync(directory, { recursive: true, force: true });
    });

    it('loads only the selected owner client and freezes permissions independently of the source object', () => {
        const path = join(directory, 'policy.json');
        writeFileSync(path, JSON.stringify({ version: 1, clients: { atlas: settings } }));
        const input = loadMcpPolicy(path, 'atlas');
        const policy = new AccessPolicy(input);
        input.scopes.push('personal');
        input.capabilities.push('remember');
        expect(policy.contains('personal')).toBe(false);
        expect(() => policy.require('remember')).toThrow('Access denied');
        expect(() => policy.readOptions({ maxSensitivity: 'invented' })).toThrow('Access denied');
        expect(() =>
            policy.requireMemory({ scope: 'project/atlas', sensitivity: 'invented' }),
        ).toThrow('Access denied');
        expect(() => loadMcpPolicy(path, 'missing')).toThrow('not configured');
        for (const invalid of [null, false, '', 0]) {
            expect(() => new AccessPolicy(invalid)).toThrow();
        }
    });

    it('fails closed on malformed, unknown and missing policy configurations before creating a vault', async () => {
        const policyFile = join(directory, 'policy.json');
        const dataDir = join(directory, 'vault');
        for (const config of [
            'not JSON',
            JSON.stringify({ version: 2, clients: { atlas: settings } }),
            JSON.stringify({ version: 1, clients: { atlas: { ...settings, surprise: true } } }),
            JSON.stringify({ version: 1, clients: { atlas: { ...settings, scopes: [] } } }),
            JSON.stringify({
                version: 1,
                clients: { atlas: { ...settings, scopes: ['project/../private'] } },
            }),
        ]) {
            writeFileSync(policyFile, config);
            await expect(
                runContextMcpServer({ policyFile, clientId: 'atlas', dataDir }),
            ).rejects.toThrow('policy');
            expect(existsSync(dataDir)).toBe(false);
        }
        await expect(runContextMcpServer({ policyFile, dataDir })).rejects.toThrow('together');
        expect(() => loadMcpPolicy(join(directory, 'missing'), 'atlas')).toThrow('policy');
    });

    it('bounds retention by age and row count and supports owner clearing', () => {
        audit = new AccessAudit({ maxEntries: 2, retentionDays: 1 });
        const old = audit.begin('atlas', 'openself_search_memory');
        audit.db
            .prepare('UPDATE access_events SET occurred_at = ? WHERE id = ?')
            .run('2000-01-01T00:00:00.000Z', old);
        expect(audit.prune()).toBe(1);
        for (const name of ['first', 'second', 'third']) {
            const id = audit.begin(name, 'openself_search_memory');
            audit.finish(id, 'allowed');
        }
        expect(audit.list().map((entry) => entry.client)).toEqual(['third', 'second']);
        expect(audit.list({ client: 'second', limit: 1 })).toHaveLength(1);
        expect(audit.clear()).toBe(2);
        expect(audit.list()).toEqual([]);
        expect(() => new AccessAudit({ retentionDays: 0 })).toThrow('Audit setting');
        expect(() => new AccessAudit({ maxEntries: 1.5 })).toThrow('Audit setting');
    });

    it('persists pending attempts across reopen without query, content or memory IDs', () => {
        const dbPath = join(directory, 'mcp-audit.db');
        audit = new AccessAudit({ dbPath });
        audit.begin('atlas', 'openself_get_context');
        audit.close();
        audit = new AccessAudit({ dbPath });
        expect(audit.list()[0]).toMatchObject({
            client: 'atlas',
            outcome: 'attempted',
            tool: 'openself_get_context',
        });
    });
});
