import chalk from 'chalk';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ContextStore } from '../context/store.js';
import { AccessAudit } from '../context/access-audit.js';
import { createContextMcpServer } from '../context/mcp.js';
import { verifyReceiptSignature } from '../context/signing.js';

const AGENT_A_POLICY = {
    clientId: 'demo-agent-a',
    scopes: ['project/alpha'],
    maxSensitivity: 'private',
    capabilities: ['read', 'remember', 'forget'],
};
const AGENT_B_POLICY = {
    clientId: 'demo-agent-b',
    scopes: ['project/alpha'],
    maxSensitivity: 'private',
    capabilities: ['read', 'propose'],
};

/**
 * Disposable two-agent / two-project handoff demo. Uses the real MCP server
 * and protocol over an in-memory transport — nothing leaves the process, and
 * the vault lives in a temporary directory unless --keep is passed.
 *
 * Scenario: agent A finishes work in project/alpha and records a decision and
 * a status; agent B picks up the next task. A parallel project/beta holds
 * near-identical decoy content, and the owner keeps a restricted note inside
 * project/alpha — neither may leak into agent B's package.
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

        // 1. Agent A finishes its work in project/alpha: a decision and a
        //    verified status update, both with source provenance.
        const decisionResult = await agentA.callTool({
            name: 'openself_remember',
            arguments: {
                type: 'decision',
                content:
                    'Project Alpha uses SQLite as the local source of truth because we need portable offline operation',
                scope: 'project/alpha',
                sensitivity: 'personal',
                sourceKind: 'agent',
                sourceLocator: 'docs/architecture.md#storage',
                sourceTitle: 'Alpha architecture review',
                tags: ['database', 'architecture'],
            },
        });
        const decision = parsePayload(decisionResult).memory;
        transcript.push({ step: 'a-decision', client: 'agent-a', memory: decision });

        const statusResult = await agentA.callTool({
            name: 'openself_remember',
            arguments: {
                type: 'fact',
                content: 'Alpha migration milestone reached: schema v4 verified on staging',
                scope: 'project/alpha',
                sourceKind: 'agent',
                sourceTitle: 'Agent A run report',
            },
        });
        const status = parsePayload(statusResult).memory;
        transcript.push({ step: 'a-status', client: 'agent-a', memory: status });

        // 2. Owner seeds decoys the agents must never see: a parallel project
        //    with near-identical wording, and a restricted note inside alpha.
        const betaDecoy = store.remember({
            type: 'decision',
            content:
                'Project Beta uses SQLite as the local source of truth — beta chose Postgres before switching',
            scope: 'project/beta',
            sensitivity: 'public',
        });
        const restricted = store.remember({
            type: 'note',
            content: 'Alpha vault recovery passphrase is in the hardware safe',
            scope: 'project/alpha',
            sensitivity: 'restricted',
            source: { kind: 'manual', title: 'Owner note' },
        });
        transcript.push({
            step: 'owner-seed',
            client: 'owner',
            betaDecoy: betaDecoy.id,
            restricted: restricted.id,
        });

        // 3. Agent B proposes the follow-up decision — it stays pending and
        //    invisible until the owner approves it.
        const proposed = await agentB.callTool({
            name: 'openself_propose_memory',
            arguments: {
                type: 'decision',
                content: 'Alpha keeps migrations in db/migrate with numbered filenames',
                scope: 'project/alpha',
                sourceTrust: 'owner', // agents can never claim owner trust — clamped
                note: 'heard in standup; needs owner review',
            },
        });
        const proposal = parsePayload(proposed).proposal;
        transcript.push({
            step: 'b-proposal',
            client: 'agent-b',
            proposal,
            trustClamped: proposal.memory.sourceTrust === 'external',
        });

        // 4. Before approval, agent B's context for the same task does not
        //    include the pending proposal.
        const preApproval = await agentB.callTool({
            name: 'openself_compile_context',
            arguments: {
                query: 'alpha database migrations',
                task: 'continue alpha migration work',
                scope: 'project/alpha',
                explain: true,
            },
        });
        const preApprovalPkg = parsePayload(preApproval);
        const pendingVisible = (preApprovalPkg.memories || []).some(
            (memory) => memory.id === proposal.id,
        );
        transcript.push({ step: 'b-pre-approval', pendingVisible });

        // 5. Owner approves the proposal — with verified trust, an owner
        //    privilege the agents never hold.
        const approved = store.approveProposal(
            proposal.id,
            { sourceTrust: 'verified' },
            { reviewNote: 'verified in notes' },
        );
        transcript.push({ step: 'owner-approval', approved });

        // 6. Agent B requests the handoff package for the new task: approved
        //    context + provenance + a signed receipt, and nothing denied.
        const handoff = await agentB.callTool({
            name: 'openself_compile_context',
            arguments: {
                query: 'alpha database migrations',
                task: 'write the next alpha migration',
                scope: 'project/alpha',
                explain: true,
            },
        });
        const handoffPkg = parsePayload(handoff);
        const receipt = handoffPkg.receipt;
        const receiptVerified = receipt?.receiptSignature
            ? verifyReceiptSignature(receipt, store.signingIdentity.publicKey)
            : false;
        const leaks = {
            betaContent: (handoffPkg.context || '').includes('Project Beta uses'),
            restrictedContent: (handoffPkg.context || '').includes('recovery passphrase'),
            deniedOnReceipt: (receipt?.candidates || []).some(
                (candidate) => candidate.decision === 'denied',
            ),
            deniedScopeName: JSON.stringify(receipt || {}).includes('project/beta'),
        };
        transcript.push({
            step: 'b-handoff',
            client: 'agent-b',
            package: handoffPkg,
            receiptVerified,
            leaks,
        });

        // 7. Agent B still cannot write — proposals are the only write path.
        const deniedWrite = await agentB.callTool({
            name: 'openself_remember',
            arguments: { content: 'attempted write', scope: 'project/alpha' },
        });
        transcript.push({
            step: 'b-denied-write',
            client: 'agent-b',
            isError: Boolean(deniedWrite.isError),
        });

        // 8. And cannot widen into the sibling project.
        const crossover = await agentB.callTool({
            name: 'openself_search_memory',
            arguments: { query: 'beta postgres sqlite', scope: 'project/beta' },
        });
        const crossoverLeaked = crossover.isError
            ? false // scope outside the policy fails closed
            : (parsePayload(crossover).memories || []).some((memory) => memory.id === betaDecoy.id);
        transcript.push({ step: 'b-crossover', crossoverLeaked });

        const events = audit.list({ limit: 30 });
        transcript.push({ step: 'audit', events });
        const pendingProposals = store.listProposals({ status: 'pending' }).length;

        const result = {
            dataDir,
            transcript,
            handoffPkg,
            receiptVerified,
            leaks,
            pendingVisible,
            deniedWrite,
            crossoverLeaked,
            approved,
            status,
            decision,
            pendingProposals,
        };
        if (options.json) {
            console.log(JSON.stringify({ dataDir, transcript }, null, 2));
        } else {
            printDemo(result);
        }
        return result;
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

function printDemo({
    dataDir,
    transcript,
    handoffPkg,
    receiptVerified,
    leaks,
    pendingVisible,
    deniedWrite,
    crossoverLeaked,
    approved,
    decision,
    pendingProposals,
}) {
    const betaDecoyId = transcript.find((item) => item.step === 'owner-seed').betaDecoy;
    console.log(chalk.bold('\nOpenSelf cross-agent handoff demo'));
    console.log(chalk.gray(`Disposable vault: ${dataDir}\n`));

    console.log(chalk.bold('1. agent-a finishes project/alpha work (MCP openself_remember)'));
    console.log(
        `   ${chalk.green('✓')} decision · trust ${decision.sourceTrust} · "${decision.content.slice(0, 72)}…"`,
    );
    console.log(
        `   ${chalk.green('✓')} status  · "Alpha migration milestone reached: schema v4 verified on staging"\n`,
    );

    console.log(chalk.bold('2. owner seeds decoys outside agent-B policy'));
    console.log(
        `   ${chalk.green('✓')} project/beta near-identical decision + restricted note inside alpha\n`,
    );

    console.log(
        chalk.bold('3. agent-b proposes the follow-up decision (MCP openself_propose_memory)'),
    );
    const proposed = transcript.find((item) => item.step === 'b-proposal');
    console.log(
        `   ${chalk.green('✓')} pending · trust clamped to ${proposed.proposal.memory.sourceTrust}\n`,
    );

    console.log(chalk.bold('4. before approval the proposal is invisible to agent-b'));
    console.log(
        `   ${pendingVisible ? chalk.red('✗ pending proposal leaked') : chalk.green('✓ not in the package')}\n`,
    );

    console.log(chalk.bold('5. owner approves — trust raised to verified'));
    console.log(`   ${chalk.green('✓')} memory ${chalk.gray(approved.id.slice(0, 8))} approved\n`);

    console.log(
        chalk.bold('6. agent-b receives the handoff package (MCP openself_compile_context)'),
    );
    const receipt = handoffPkg.receipt;
    console.log(chalk.cyan('   --- context block ---'));
    for (const line of (handoffPkg.context || '').split('\n')) console.log(`   ${line}`);
    console.log(chalk.cyan('   ---------------------'));
    for (const entry of receipt?.candidates || []) {
        console.log(
            `   ${entry.decision === 'selected' ? chalk.green('✓') : '–'} ` +
                `${entry.type} ${chalk.gray(entry.scope)} · ${entry.decision} · ` +
                `${entry.sensitivity}/${entry.sourceTrust}`,
        );
    }
    console.log(
        `   receipt ${receipt?.receiptHash?.slice(0, 16)}… ` +
            `${receiptVerified ? chalk.green('signature verified') : chalk.red('unsigned')}\n`,
    );

    console.log(chalk.bold('7. handoff evidence'));
    console.log(
        `   objective: "write the next alpha migration" · ` +
            `sources: ${
                (handoffPkg.memories || [])
                    .map(
                        (memory) =>
                            memory.source?.locator || memory.source?.title || memory.source?.kind,
                    )
                    .join(', ') || '—'
            }`,
    );
    console.log(
        `   leaks: beta ${leaks.betaContent ? chalk.red('LEAKED') : chalk.green('none')} · ` +
            `restricted ${leaks.restrictedContent ? chalk.red('LEAKED') : chalk.green('none')} · ` +
            `denied rows on receipt ${leaks.deniedOnReceipt ? chalk.red('LEAKED') : chalk.green('none')}`,
    );
    console.log(
        `   write attempt ${deniedWrite.isError ? chalk.red('denied') : chalk.green('allowed')} · ` +
            `beta crossover ${crossoverLeaked ? chalk.red('LEAKED') : chalk.green('none')}`,
    );
    console.log(
        `   unresolved: proposals still pending ${pendingProposals} · ` +
            `beta decoy ${betaDecoyId.slice(0, 8)} stayed out of scope\n`,
    );
}
