import chalk from 'chalk';
import { ContextStore } from '../context/store.js';

/**
 * Owner-side Memory Inbox: review, approve (optionally edited), or reject
 * memory proposals submitted by agents.
 */
export function inboxCommand(action = 'list', options = {}) {
    const store = new ContextStore({
        dataDir: options.dataDir || process.env.DATA_DIR || './data',
    });
    try {
        switch (action) {
            case 'list':
                return listProposals(store, options);
            case 'approve':
                return approveProposal(store, options);
            case 'reject':
                return rejectProposal(store, options);
            default:
                throw new Error(`Unknown inbox action: ${action}. Use list, approve, or reject.`);
        }
    } finally {
        store.close();
    }
}

function listProposals(store, options) {
    const proposals = store.listProposals({
        status: options.status === undefined ? 'pending' : options.status,
        proposedBy: options.client,
        limit: Number(options.limit || 50),
    });
    if (options.json) {
        console.log(JSON.stringify({ proposals }, null, 2));
        return proposals;
    }
    if (!proposals.length) {
        console.log(chalk.gray('No proposals match.'));
        return proposals;
    }
    for (const proposal of proposals) {
        const memory = proposal.memory;
        console.log(
            `${chalk.cyan(proposal.id.slice(0, 8))} ${chalk.bold(memory.type)} ` +
                `${chalk.gray(memory.scope)} [${memory.sensitivity}] ` +
                `from ${proposal.proposedBy} at ${proposal.proposedAt}`,
        );
        console.log(`   ${memory.content}`);
        if (proposal.note) console.log(chalk.gray(`   note: ${proposal.note}`));
    }
    console.log(
        chalk.gray(
            `\nApprove: openself inbox approve --id <id> · Reject: openself inbox reject --id <id>`,
        ),
    );
    return proposals;
}

function approveProposal(store, options) {
    if (!options.id) throw new Error('--id is required for inbox approve');
    const overrides = {};
    if (options.content) overrides.content = options.content;
    if (options.type) overrides.type = options.type;
    if (options.scope) overrides.scope = options.scope;
    if (options.sensitivity) overrides.sensitivity = options.sensitivity;
    if (options.sourceTrust) overrides.sourceTrust = options.sourceTrust;
    if (options.tags) {
        overrides.tags = String(options.tags)
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean);
    }
    const memory = store.approveProposal(options.id, overrides, {
        reviewNote: options.reviewNote || options.note,
    });
    if (!memory) throw new Error(`Proposal not found: ${options.id}`);
    if (options.json) {
        console.log(JSON.stringify({ approved: true, memory }, null, 2));
        return memory;
    }
    console.log(chalk.green(`✓ Approved and remembered ${memory.type} ${memory.id}`));
    return memory;
}

function rejectProposal(store, options) {
    if (!options.id) throw new Error('--id is required for inbox reject');
    const rejected = store.rejectProposal(options.id, {
        reviewNote: options.reviewNote || options.note,
    });
    if (!rejected) {
        const proposal = store.getProposal(options.id);
        throw new Error(
            proposal
                ? `Proposal ${options.id} is already ${proposal.status}`
                : `Proposal not found: ${options.id}`,
        );
    }
    if (options.json) {
        console.log(JSON.stringify({ rejected: true, id: options.id }, null, 2));
        return rejected;
    }
    console.log(chalk.green(`✓ Rejected proposal ${options.id}`));
    return rejected;
}
