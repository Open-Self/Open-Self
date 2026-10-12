import { ContextStore } from './store.js';

export function evaluateContextVault(dataset, options = {}) {
    const store = options.store || new ContextStore({ dbPath: ':memory:' });
    const ownsStore = !options.store;
    try {
        const ids = new Map();
        for (const item of dataset.memories || []) {
            ids.set(item.key, store.remember(item.memory).id);
        }

        const recallCases = (dataset.recall || []).map((testCase) => {
            const results = store.search(testCase.query, searchOptions(testCase));
            const resultIds = results.map((memory) => memory.id);
            const relevantIds = testCase.relevant.map((key) => requiredId(ids, key));
            const hits = relevantIds.filter((id) => resultIds.includes(id)).length;
            const firstRank = resultIds.findIndex((id) => relevantIds.includes(id));
            return {
                name: testCase.name,
                recall: relevantIds.length ? hits / relevantIds.length : 1,
                reciprocalRank: firstRank < 0 ? 0 : 1 / (firstRank + 1),
                returned: resultIds.length,
            };
        });

        const temporalCases = (dataset.temporal || []).map((testCase) => {
            const resultIds = store
                .search(testCase.query, searchOptions(testCase))
                .map((memory) => memory.id);
            const assertions = [
                ...(testCase.include || []).map((key) => resultIds.includes(requiredId(ids, key))),
                ...(testCase.exclude || []).map((key) => !resultIds.includes(requiredId(ids, key))),
            ];
            return {
                name: testCase.name,
                score: assertions.length
                    ? assertions.filter(Boolean).length / assertions.length
                    : 1,
            };
        });

        const privacyCases = (dataset.privacy || []).map((testCase) => {
            const resultIds = store
                .search(testCase.query, searchOptions(testCase))
                .map((memory) => memory.id);
            const forbidden = testCase.forbidden.map((key) => requiredId(ids, key));
            const leaked = forbidden.filter((id) => resultIds.includes(id));
            return {
                name: testCase.name,
                checked: forbidden.length,
                leaked: leaked.length,
                score: forbidden.length ? 1 - leaked.length / forbidden.length : 1,
            };
        });

        const provenanceKeys = dataset.provenance || [...ids.keys()];
        const provenanceCases = provenanceKeys.map((key) => {
            const memory = store.get(requiredId(ids, key));
            const complete = Boolean(
                memory?.source?.kind &&
                memory.source.kind !== 'manual' &&
                (memory.source.locator || memory.source.title),
            );
            return { key, complete };
        });

        const metrics = {
            recallAtK: average(recallCases.map((item) => item.recall)),
            meanReciprocalRank: average(recallCases.map((item) => item.reciprocalRank)),
            temporalCorrectness: average(temporalCases.map((item) => item.score)),
            privacyProtection: average(privacyCases.map((item) => item.score)),
            provenanceCompleteness: average(provenanceCases.map((item) => (item.complete ? 1 : 0))),
        };
        const thresholds = {
            recallAtK: 0.8,
            meanReciprocalRank: 0.7,
            temporalCorrectness: 1,
            privacyProtection: 1,
            provenanceCompleteness: 1,
            ...(dataset.thresholds || {}),
        };
        const failures = Object.entries(thresholds)
            .filter(([metric, threshold]) => (metrics[metric] ?? 0) < threshold)
            .map(([metric, threshold]) => ({ metric, actual: metrics[metric] ?? 0, threshold }));

        return {
            dataset: dataset.name || 'context-vault',
            passed: failures.length === 0,
            metrics: roundMetrics(metrics),
            thresholds,
            failures,
            cases: {
                recall: recallCases,
                temporal: temporalCases,
                privacy: privacyCases,
                provenance: provenanceCases,
            },
        };
    } finally {
        if (ownsStore) store.close();
    }
}

function searchOptions(testCase) {
    return {
        scope: testCase.scope,
        type: testCase.type,
        maxSensitivity: testCase.maxSensitivity || 'restricted',
        retrieval: testCase.retrieval || 'hybrid',
        asOf: testCase.asOf,
        limit: testCase.k || 5,
    };
}

function requiredId(ids, key) {
    const id = ids.get(key);
    if (!id) throw new Error(`Evaluation references unknown memory key: ${key}`);
    return id;
}

function average(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 1;
}

function roundMetrics(metrics) {
    return Object.fromEntries(
        Object.entries(metrics).map(([key, value]) => [key, Number(value.toFixed(4))]),
    );
}
