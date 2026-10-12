import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { evaluateCompilerVault } from '../../../src/context/compiler-evaluator.js';
import { ContextStore } from '../../../src/context/store.js';

describe('compiler evaluation receipt integrity', () => {
    it('accepts signed packages and keeps a caller-owned store open', () => {
        const dir = mkdtempSync(join(tmpdir(), 'openself-evaluator-'));
        const store = new ContextStore({ dataDir: dir });
        try {
            const report = evaluateCompilerVault(
                {
                    memories: [{ key: 'atlas', memory: { content: 'Atlas uses SQLite' } }],
                    cases: [
                        {
                            kind: 'receipt',
                            request: { query: 'Atlas' },
                            expect: { include: ['atlas'], receiptIntegrity: true },
                        },
                    ],
                },
                { store },
            );
            expect(report.passed).toBe(true);
            expect(store.list()).toHaveLength(1);
        } finally {
            store.close();
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it.each([
        [undefined, ['receipt missing']],
        [
            {
                contextHash: 'tampered',
                receiptSignature: 'invalid',
                candidates: [{ id: 'private', decision: 'denied', type: 'fact' }],
            },
            [
                'contextHash does not cite the rendered package',
                'receipt signature failed verification',
                'denied candidates expose scope/type metadata',
            ],
        ],
    ])('rejects missing or tampered receipts', (receipt, failures) => {
        const store = new ContextStore({ dbPath: ':memory:' });
        try {
            vi.spyOn(store, 'compileContext').mockReturnValue({
                context: '',
                memories: [],
                receipt,
            });
            const report = evaluateCompilerVault(
                { cases: [{ kind: 'receipt', expect: { receiptIntegrity: true } }] },
                { store },
            );
            expect(report.passed).toBe(false);
            expect(report.cases[0].score).toBe(0);
            expect(report.cases[0].failures).toEqual(failures);
        } finally {
            store.close();
        }
    });
});
