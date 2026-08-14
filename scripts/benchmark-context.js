import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { ContextStore } from '../src/context/store.js';

const countArg = process.argv.find((value) => value.startsWith('--count='));
const count = Math.min(Math.max(Number(countArg?.split('=')[1] || 1_000), 100), 20_000);
const directory = mkdtempSync(join(tmpdir(), 'openself-benchmark-'));
const store = new ContextStore({ dataDir: directory });

try {
    const insertStart = performance.now();
    for (let index = 0; index < count; index++) {
        store.remember({
            type: index % 3 === 0 ? 'decision' : 'note',
            content: `Project ${index % 25} uses database ${index % 2 ? 'PostgreSQL' : 'SQLite'} for service ${index}`,
            scope: `project/project-${index % 25}`,
            tags: ['benchmark', `service-${index}`],
        });
    }
    const insertMs = performance.now() - insertStart;

    const queries = [
        ['Which db did project 3 choose?', 'project/project-3'],
        ['PostgreSQL service', 'project/project-7'],
        ['database architecture', 'project/project-12'],
        ['SQLite storage', 'project/project-20'],
    ];
    const durations = [];
    for (let iteration = 0; iteration < 10; iteration++) {
        for (const [query, scope] of queries) {
            const started = performance.now();
            store.search(query, { scope, limit: 10 });
            durations.push(performance.now() - started);
        }
    }
    durations.sort((left, right) => left - right);

    console.log(
        JSON.stringify(
            {
                memories: count,
                insertMs: Number(insertMs.toFixed(2)),
                insertsPerSecond: Number(((count / insertMs) * 1_000).toFixed(1)),
                hybridSearch: {
                    samples: durations.length,
                    medianMs: Number(durations[Math.floor(durations.length / 2)].toFixed(2)),
                    p95Ms: Number(durations[Math.floor(durations.length * 0.95)].toFixed(2)),
                },
                vectorModel: store.stats().vectorModel,
            },
            null,
            2,
        ),
    );
} finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
}
