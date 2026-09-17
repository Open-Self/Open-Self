import chalk from 'chalk';
import { ContextStore } from '../context/store.js';

/**
 * Build a bounded context block for a query — the same call agents make
 * through `openself_get_context`, plus an optional context receipt.
 */
export async function contextCommand(query, options = {}) {
    if (!query || !query.trim()) throw new Error('A context query is required');
    const store = new ContextStore({
        dataDir: options.dataDir || process.env.DATA_DIR || './data',
        embeddings: options.embeddings,
    });
    try {
        if (!store.vectorSync) await store.indexPending();
        const result = await store.buildContextAsync(query.trim(), {
            scope: options.scope,
            type: options.type,
            maxSensitivity: options.maxSensitivity || 'restricted',
            minSourceTrust: options.minSourceTrust,
            retrieval: options.mode || options.retrieval || 'hybrid',
            limit: options.limit ? Number(options.limit) : undefined,
            maxChars: options.maxChars ? Number(options.maxChars) : undefined,
            asOf: options.asOf,
            explain: Boolean(options.explain),
        });

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
                (receipt.contextHash ? ` · hash ${receipt.contextHash.slice(0, 16)}…` : ''),
        ),
    );
    for (const candidate of receipt.candidates) {
        const mark = candidate.decision === 'selected' ? chalk.green('✓') : chalk.yellow('–');
        const ranks = [
            candidate.match?.lexicalRank != null ? `lex#${candidate.match.lexicalRank}` : null,
            candidate.match?.vectorRank != null ? `vec#${candidate.match.vectorRank}` : null,
            candidate.match?.vectorSimilarity != null
                ? `sim ${candidate.match.vectorSimilarity}`
                : null,
        ]
            .filter(Boolean)
            .join(' ');
        console.log(
            ` ${mark} ${candidate.type} ${chalk.gray(candidate.scope)} ` +
                `${chalk.gray(`[${candidate.sensitivity}/${candidate.sourceTrust}]`)} ` +
                `${ranks} ${chalk.gray(candidate.reason)} ${chalk.gray(candidate.id.slice(0, 8))}`,
        );
    }
    console.log('');
}
