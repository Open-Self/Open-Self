import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { AccessPolicy } from '../src/context/access-policy.js';
import { ContextStore } from '../src/context/store.js';

/**
 * Large-vault compiler benchmark — measures compileContext latency across a
 * vault with supersession chains, entities and a requester policy, at scales
 * where the Context Firewall must stay cheap.
 */
const countArg = process.argv.find((value) => value.startsWith('--count='));
const count = Math.min(Math.max(Number(countArg?.split('=')[1] || 5_000), 100), 50_000);
const outArg = process.argv.find((value) => value.startsWith('--out='));
const directory = mkdtempSync(join(tmpdir(), 'openself-compiler-bench-'));
const store = new ContextStore({ dataDir: directory });

try {
    const insertStart = performance.now();
    const supersededIds = [];
    for (let index = 0; index < count; index++) {
        const memory = store.remember({
            type: index % 4 === 0 ? 'decision' : index % 4 === 1 ? 'fact' : 'note',
            content: `Project ${index % 50} chose database ${index % 3 ? 'PostgreSQL' : 'SQLite'} revision ${index}`,
            scope: `project/project-${index % 50}`,
            sensitivity: index % 17 === 0 ? 'restricted' : 'private',
            sourceTrust: index % 11 === 0 ? 'external' : 'trusted',
            tags: ['benchmark', `service-${index}`],
        });
        if (index % 10 === 0) supersededIds.push(memory.id);
    }
    const entity = store.ensureEntity({ kind: 'project', canonical: 'Bench Atlas' });
    for (let index = 0; index < Math.min(supersededIds.length, 200); index++) {
        const id = supersededIds[index];
        const replacement = store.remember({
            type: 'decision',
            content: `Project bench supersession revision ${index}`,
            scope: `project/project-${index % 50}`,
            sensitivity: 'private',
        });
        store.linkEntity(replacement.id, entity.id, 'works_on');
        store.supersede(replacement.id, id);
    }
    const insertMs = performance.now() - insertStart;

    const policy = new AccessPolicy({
        clientId: 'bench-reader',
        scopes: ['project'],
        deny: ['project/project-13'],
        maxSensitivity: 'private',
        minSourceTrust: 'untrusted',
        capabilities: ['read'],
        budget: { maxChars: 8_000, maxItems: 12 },
    });
    const requests = [
        { query: 'PostgreSQL database decision', scope: 'project/project-3' },
        { query: 'SQLite storage revision', scope: 'project/project-20' },
        { query: 'database architecture', entity: 'Bench Atlas' },
        { query: 'benchmark supersession', scope: 'project' },
    ];
    const durations = [];
    const receiptCandidates = [];
    for (let iteration = 0; iteration < 8; iteration++) {
        for (const request of requests) {
            const started = performance.now();
            const pkg = store.compileContext(
                { explain: true, asOf: new Date().toISOString(), ...request },
                { policy },
            );
            durations.push(performance.now() - started);
            receiptCandidates.push(pkg.receipt.candidates.length);
        }
    }
    durations.sort((left, right) => left - right);

    const report = {
        memories: count + Math.min(supersededIds.length, 200),
        superseded: Math.min(supersededIds.length, 200),
        insertMs: Number(insertMs.toFixed(2)),
        insertsPerSecond: Number(((count / insertMs) * 1_000).toFixed(1)),
        compile: {
            samples: durations.length,
            medianMs: Number(durations[Math.floor(durations.length / 2)].toFixed(2)),
            p95Ms: Number(durations[Math.floor(durations.length * 0.95)].toFixed(2)),
            receiptCandidatesMedian: receiptCandidates.sort((a, b) => a - b)[
                Math.floor(receiptCandidates.length / 2)
            ],
        },
        vectorModel: store.stats().vectorModel,
        recordedAt: new Date().toISOString(),
        node: process.version,
        platform: `${process.platform}/${process.arch}`,
    };
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    console.log(serialized);
    if (outArg) {
        writeFileSync(outArg.split('=').slice(1).join('='), serialized, 'utf8');
    }
} finally {
    store.close();
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
}
