import chalk from 'chalk';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ContextStore } from '../context/store.js';
import { AccessAudit } from '../context/access-audit.js';
import { createContextMcpServer } from '../context/mcp.js';

const AGENT_A_POLICY = {
    clientId: 'demo-agent-a',
    scopes: ['project/atlas'],
    maxSensitivity: 'private',
    capabilities: ['read', 'remember', 'forget'],
};
const AGENT_B_POLICY = {
    clientId: 'demo-agent-b',
    scopes: ['project/atlas'],
    maxSensitivity: 'private',
    capabilities: ['read', 'propose'],
};

/**
 * Disposable cross-agent demo. Uses the real MCP server and protocol over an
 * in-memory transport — nothing leaves the process, and the vault lives in a
 * temporary directory unless --keep is passed.
 */
export async function demoCommand(options = {}) {
    const keep = Boolean(options.keep);
    const dataDir = keep
        ? options.dataDir || process.env.DATA_DIR || './data-demo'
        : mkdtempSync(join(tmpdir(), 'openself-demo-'));
    const store = new ContextStore({ dataDir });
    const audit = new AccessAudit({ dbPath: ':memory:' });
    const transcript = [];
    const clients = [];

    try {
        const agentA = await connectAgent(store, audit, AGENT_A_POLICY);
        const agentB = await connectAgent(store, audit, AGENT_B_POLICY);

        // 1. Agent A stores a durable decision.
        const remembered = await agentA.callTool({
            name: 'openself_remember',
            arguments: {
                type: 'decision',
                content:
                    'Project Atlas uses SQLite as the local source of truth because we need portable offline operation',
                scope: 'project/atlas',
                sensitivity: 'personal',
                sourceKind: 'agent',
                sourceTitle: 'Atlas architecture review',
                tags: ['database', 'architecture'],
            },
        });
        const stored = parsePayload(remembered);
        transcript.push({ step: 'remember', client: 'agent-a', memory: stored.memory });

        // 2. The owner stores a restricted memory the agents must not see.
        const restricted = store.remember({
            type: 'note',
            content: 'Personal banking credential rotation scheduled for next week',
            scope: 'project/atlas',
            sensitivity: 'restricted',
            source: { kind: 'manual', title: 'Owner note' },
        });

        // 3. Agent B asks a question and receives context with provenance.
        const answer = await agentB.callTool({
            name: 'openself_get_context',
            arguments: {
                query: 'What database does Atlas use and why?',
                scope: 'project/atlas',
                explain: true,
            },
        });
        const contextPayload = parsePayload(answer);
        transcript.push({ step: 'context', client: 'agent-b', result: contextPayload });

        // 4. Agent B tries a write and is denied by policy.
        const denied = await agentB.callTool({
            name: 'openself_remember',
            arguments: { content: 'attempted write', scope: 'project/atlas' },
        });
        transcript.push({
            step: 'denied-write',
            client: 'agent-b',
            isError: Boolean(denied.isError),
        });

        // 5. Agent B proposes a memory instead — it waits for owner approval.
        const proposed = await agentB.callTool({
            name: 'openself_propose_memory',
            arguments: {
                type: 'fact',
                content: 'The Atlas team decided to keep migrations in db/migrate',
                scope: 'project/atlas',
                note: 'heard in standup',
            },
        });
        const proposal = parsePayload(proposed).proposal;
        const approved = store.approveProposal(
            proposal.id,
            {},
            { reviewNote: 'verified in notes' },
        );
        transcript.push({ step: 'proposal', client: 'agent-b', proposal, approved });

        // 6. Agent B cannot see the restricted memory at all.
        const search = await agentB.callTool({
            name: 'openself_search_memory',
            arguments: { query: 'banking credential', scope: 'project/atlas' },
        });
        const searchPayload = parsePayload(search);
        const leaked = (searchPayload.memories || []).some((m) => m.id === restricted.id);
        transcript.push({ step: 'restricted-search', client: 'agent-b', leaked });

        const events = audit.list({ limit: 20 });
        transcript.push({ step: 'audit', events });

        if (options.json) {
            console.log(JSON.stringify({ dataDir, transcript }, null, 2));
        } else {
            printDemo({ dataDir, transcript, contextPayload, denied, approved, leaked, events });
        }
        return { dataDir, transcript };
    } finally {
        await closeAll();
        audit.close();
        store.close();
        if (!keep) rmSync(dataDir, { recursive: true, force: true });
    }

    async function connectAgent(storeRef, auditRef, policy) {
        const server = createContextMcpServer(storeRef, { policy, audit: auditRef });
        const client = new Client({ name: policy.clientId, version: '1.0.0' });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
        clients.push({ client, server });
        return client;
    }

    async function closeAll() {
        for (const { client, server } of clients.splice(0)) {
            await client.close().catch(() => {});
            await server.close().catch(() => {});
        }
    }
}

function parsePayload(result) {
    return result.structuredContent ?? JSON.parse(result.content[0].text);
}

function printDemo({ dataDir, transcript, contextPayload, denied, approved, leaked, events }) {
    const stored = transcript.find((item) => item.step === 'remember').memory;
    console.log(chalk.bold('\nOpenSelf cross-agent demo'));
    console.log(chalk.gray(`Disposable vault: ${dataDir}\n`));

    console.log(chalk.bold('1. agent-a stores a decision (MCP openself_remember)'));
    console.log(
        `   ${chalk.green('✓')} ${stored.type} · ${stored.scope} · trust ${stored.sourceTrust}`,
    );
    console.log(`   "${stored.content}"\n`);

    console.log(chalk.bold('2. owner stores a restricted memory directly (outside agent policy)'));
    console.log(`   ${chalk.green('✓')} sensitivity restricted\n`);

    console.log(chalk.bold('3. agent-b asks a question (MCP openself_get_context --explain)'));
    const receipt = contextPayload.receipt;
    for (const entry of receipt?.candidates || []) {
        console.log(
            `   ${chalk.green('✓')} ${entry.type} ${chalk.gray(entry.scope)} ` +
                `sim ${entry.match?.vectorSimilarity ?? '—'} · ${entry.decision} · ` +
                `${entry.sensitivity}/${entry.sourceTrust}`,
        );
    }
    console.log(chalk.cyan('\n   --- context block ---'));
    for (const line of (contextPayload.context || '').split('\n')) console.log(`   ${line}`);
    console.log(chalk.cyan('   ---------------------\n'));

    console.log(chalk.bold('4. agent-b attempts a write — policy denies it'));
    console.log(
        `   ${denied.isError ? chalk.red('denied') : chalk.green('allowed')} (no remember capability)\n`,
    );

    console.log(chalk.bold('5. agent-b proposes a memory instead — owner approves it'));
    console.log(
        `   ${chalk.green('✓')} proposal ${chalk.gray(approved.id.slice(0, 8))} approved → ` +
            `memory with trust ${approved.sourceTrust}`,
    );
    console.log(`   "${approved.content}"\n`);

    console.log(chalk.bold('6. agent-b searches for the restricted memory'));
    console.log(
        `   ${leaked ? chalk.red('LEAKED') : chalk.green('not visible')} — restricted memories require an owner grant\n`,
    );

    console.log(chalk.bold('7. local access audit'));
    for (const event of events) {
        console.log(
            `   ${chalk.gray(event.occurredAt)} ${event.client} ${event.tool} → ${event.outcome}`,
        );
    }

    console.log(chalk.bold('\nNext steps'));
    console.log('  openself init                       # create your real vault');
    console.log('  openself connect claude             # wire a compatible client');
    console.log('  openself mcp                        # run the stdio MCP server');
    console.log('  openself dashboard                  # inspect the vault locally');
}
