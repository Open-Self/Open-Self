import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { evaluateCompilerVault } from '../../../src/context/compiler-evaluator.js';
import { ContextStore } from '../../../src/context/store.js';

describe('compiler evaluation', () => {
    it('verifies the versioned truth, privacy, temporal and receipt promises', () => {
        const dataset = JSON.parse(readFileSync('evals/context-compiler.json', 'utf8'));
        const report = evaluateCompilerVault(dataset);
        expect(report.passed).toBe(true);
        expect(report.failures).toEqual([]);
        expect(report.metrics).toEqual({
            'current-truth': 1,
            temporal: 1,
            policy: 1,
            staleness: 1,
            redundancy: 1,
            'cross-scope': 1,
            receipt: 1,
        });
        expect(report.cases).toHaveLength(dataset.cases.length);
        expect(report.cases.every((item) => item.failures.length === 0)).toBe(true);
    });

    it('accepts an empty dataset without inventing metrics', () => {
        const report = evaluateCompilerVault({});
        expect(report.dataset).toBe('openself-compiler');
        expect(report.metrics).toEqual({});
        expect(report.passed).toBe(true);
    });

    it('reports an unknown policy as a failed policy case', () => {
        const report = evaluateCompilerVault({ cases: [{ name: 'unknown', policy: 'missing' }] });
        expect(report.passed).toBe(false);
        expect(report.failures).toEqual([{ metric: 'policy', actual: 0, threshold: 1 }]);
        expect(report.cases[0].failures).toEqual(['unknown policy client: missing']);
    });

    it('distinguishes expected refusals from unexpected compiler errors', () => {
        const store = new ContextStore({ dbPath: ':memory:' });
        try {
            vi.spyOn(store, 'compileContext').mockImplementation(() => {
                throw new Error('compiler unavailable');
            });
            const report = evaluateCompilerVault(
                {
                    thresholds: { custom: 0.5 },
                    cases: [
                        { name: 'expected', expect: { refused: true } },
                        { name: 'unexpected', kind: 'custom' },
                    ],
                },
                { store },
            );
            expect(report.cases[0]).toMatchObject({ score: 1, failures: [] });
            expect(report.cases[1].failures).toEqual(['compile threw: compiler unavailable']);
            expect(report.failures).toEqual([{ metric: 'custom', actual: 0, threshold: 0.5 }]);
            expect(store.list()).toEqual([]);
        } finally {
            store.close();
        }
    });

    it('scores missing selections and receipt decisions with actionable failures', () => {
        const report = evaluateCompilerVault({
            memories: [{ key: 'atlas', memory: { content: 'Atlas uses SQLite' } }],
            cases: [
                {
                    name: 'wrong expectations',
                    kind: 'custom',
                    request: { query: 'Atlas' },
                    expect: {
                        include: ['missing'],
                        exclude: ['atlas', 'unknown'],
                        denied: ['atlas'],
                        skipped: ['atlas'],
                        dedupeGroups: [['atlas', 'missing']],
                        noLeak: ['SQLite'],
                        refused: true,
                    },
                },
                { name: 'no expectations', request: { query: 'Atlas' } },
            ],
        });
        expect(report.passed).toBe(false);
        expect(report.failures).toContainEqual({ metric: 'custom', actual: 0, threshold: 1 });
        expect(report.cases[0].failures).toEqual(
            expect.arrayContaining([
                'expected missing in the package',
                'excluded atlas was selected',
                'excluded atlas content leaked into context',
                'expected atlas marked denied on the receipt',
                'expected atlas marked skipped on the receipt',
                'forbidden text leaked: "SQLite"',
                'expected a policy refusal but compile succeeded',
            ]),
        );
        expect(report.cases[1].score).toBe(1);
    });

    it('ignores unresolved optional supersession and entity links', () => {
        const report = evaluateCompilerVault({
            memories: [
                { key: 'atlas', supersedes: 'missing', memory: { content: 'Atlas uses SQLite' } },
            ],
            entities: [
                { kind: 'project', canonical: 'Atlas', links: [{ memory: 'missing' }] },
                { kind: 'person', canonical: 'Synthetic owner' },
            ],
            cases: [{ request: { query: 'Atlas' }, expect: { include: ['atlas'] } }],
        });
        expect(report.passed).toBe(true);
        expect(report.cases[0].selected).toEqual(['atlas']);
    });
});
