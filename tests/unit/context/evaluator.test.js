import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateContextVault } from '../../../src/context/evaluator.js';

describe('evaluateContextVault', () => {
    it('passes the versioned Context Vault evaluation dataset', () => {
        const dataset = JSON.parse(
            readFileSync(join(process.cwd(), 'evals', 'context-vault.json'), 'utf8'),
        );

        const report = evaluateContextVault(dataset);

        expect(report.passed).toBe(true);
        expect(report.metrics).toEqual({
            recallAtK: 1,
            meanReciprocalRank: 1,
            temporalCorrectness: 1,
            privacyProtection: 1,
            provenanceCompleteness: 1,
        });
        expect(report.cases.privacy.every((item) => item.leaked === 0)).toBe(true);
    });

    it('fails with an actionable metric when retrieval misses required context', () => {
        const report = evaluateContextVault({
            name: 'deliberate-failure',
            thresholds: { recallAtK: 1 },
            memories: [
                {
                    key: 'needed',
                    memory: {
                        content: 'The launch codename is Bluebird',
                        source: { kind: 'document', locator: 'launch.md' },
                    },
                },
            ],
            recall: [
                { name: 'miss', query: 'unrelated quantum zebras', relevant: ['needed'], k: 1 },
            ],
        });

        expect(report.passed).toBe(false);
        expect(report.failures).toContainEqual({ metric: 'recallAtK', actual: 0, threshold: 1 });
    });

    it('rejects dataset cases that reference unknown memory keys', () => {
        expect(() =>
            evaluateContextVault({
                memories: [],
                recall: [{ name: 'invalid', query: 'anything', relevant: ['missing'] }],
            }),
        ).toThrow('unknown memory key: missing');
    });
});
