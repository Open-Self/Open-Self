import chalk from 'chalk';
import { ContextStore } from '../context/store.js';

/**
 * Compile a bounded context package for a query — the same pipeline agents
 * reach through `openself_compile_context`, plus an optional receipt.
 */
export async function contextCommand(query, options = {}) {
    if (!query || !query.trim()) throw new Error('A context query is required');
    const store = new ContextStore({
        dataDir: options.dataDir || process.env.DATA_DIR || './data',
        embeddings: options.embeddings,
    });
    try {
        if (!store.vectorSync) await store.indexPending();
        const result = await store.compileContextAsync(
            {
                query: query.trim(),
                task: options.task,
                agent: options.agent,
                purpose: options.purpose,
                scope: options.scope,
                type: options.type,
                entity: options.entity,
                maxSensitivity: options.maxSensitivity || 'restricted',
                minSourceTrust: options.minSourceTrust,
                asOf: options.asOf,
                retrieval: options.mode || options.retrieval || 'hybrid',
                format: options.format || 'block',
                explain: Boolean(options.explain),
                includeSuperseded: Boolean(options.includeSuperseded || options.superseded),
                includeStale: Boolean(options.includeStale || options.stale),
                budget: {
                    maxChars: options.maxChars ? Number(options.maxChars) : undefined,
                    maxTokens: options.maxTokens ? Number(options.maxTokens) : undefined,
                    maxItems: options.limit ? Number(options.limit) : undefined,
                },
            },
            {
                // Local CLI is owner-authorized — the receipt may enumerate
                // policy-denied candidates for debugging.
                diagnostics: true,
                envelope: {
                    clientId: 'cli',
                    maxSensitivity: options.maxSensitivity || 'restricted',
                    minSourceTrust: options.minSourceTrust || 'untrusted',
                    budget: {
                        maxChars: options.maxChars ? Number(options.maxChars) : undefined,
                        maxTokens: options.maxTokens ? Number(options.maxTokens) : undefined,
                        maxItems: options.limit ? Number(options.limit) : undefined,
                    },
                },
            },
        );

        if (options.json) {
            console.log(JSON.stringify(result, null, 2));
            return result;
        }

        if (options.explain && result.receipt) printReceipt(result.receipt);
        console.log(result.context || chalk.gray('(no matching context)'));
        return result;
    } finally {
        store.close();
    }
}

function printReceipt(receipt) {
    console.log(chalk.bold('Context receipt'));
    console.log(
        chalk.gray(
            `asOf ${receipt.asOf} · retrieval ${receipt.retrieval} · ` +
                `${receipt.totals.selected}/${receipt.totals.candidates} selected · ` +
                `${receipt.totals.usedChars} chars` +
                (receipt.requester ? ` · requester ${receipt.requester.clientId}` : '') +
                (receipt.contextHash ? ` · hash ${receipt.contextHash.slice(0, 16)}…` : ''),
        ),
    );
    for (const candidate of receipt.candidates) {
        const mark =
            candidate.decision === 'selected'
                ? chalk.green('✓')
                : candidate.decision === 'denied'
                  ? chalk.red('✕')
                  : chalk.yellow('–');
        const ranks = [
            candidate.match?.lexicalRank != null ? `lex#${candidate.match.lexicalRank}` : null,
            candidate.match?.vectorRank != null ? `vec#${candidate.match.vectorRank}` : null,
            candidate.match?.vectorSimilarity != null
                ? `sim ${candidate.match.vectorSimilarity}`
                : null,
        ]
            .filter(Boolean)
            .join(' ');
        const descriptor = candidate.type
            ? `${candidate.type} ${chalk.gray(candidate.scope)} ` +
              `${chalk.gray(`[${candidate.sensitivity}/${candidate.sourceTrust}]`)}`
            : chalk.gray('[policy-denied]');
        console.log(
            ` ${mark} ${descriptor} ` +
                `${ranks} ${chalk.gray(candidate.reason)} ${chalk.gray(candidate.id.slice(0, 8))}`,
        );
    }
    console.log('');
}
