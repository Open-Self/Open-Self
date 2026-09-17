import { afterEach, describe, expect, it } from 'vitest';
import { ContextStore } from '../../../src/context/store.js';

describe('memory proposals', () => {
    let store;
    afterEach(() => store?.close());

    it('keeps proposed memories out of search until approved', () => {
        store = new ContextStore({ dbPath: ':memory:' });
        const proposal = store.proposeMemory(
            { type: 'decision', content: 'Atlas uses SQLite', scope: 'project/atlas' },
            { proposedBy: 'agent-a', note: 'architecture review' },
        );
        expect(proposal.status).toBe('pending');
        expect(proposal.proposedBy).toBe('agent-a');
        expect(store.search('SQLite', { scope: 'project/atlas' })).toHaveLength(0);
        expect(store.get(proposal.id)).toBeNull();
        expect(store.stats().proposals.pending).toBe(1);
    });

    it('approves a proposal into a durable memory with review metadata', () => {
        store = new ContextStore({ dbPath: ':memory:' });
        const proposal = store.proposeMemory(
            {
                type: 'decision',
                content: 'Atlas uses SQLite',
                scope: 'project/atlas',
                sourceTrust: 'external',
            },
            { proposedBy: 'agent-a' },
        );
        const memory = store.approveProposal(
            proposal.id,
            { sourceTrust: 'verified', scope: 'project/atlas/core' },
            { reviewNote: 'confirmed in architecture doc' },
        );
        expect(memory.id).toBe(proposal.id);
        expect(memory.sourceTrust).toBe('verified');
        expect(memory.scope).toBe('project/atlas/core');
        expect(store.get(proposal.id)).not.toBeNull();

        const resolved = store.getProposal(proposal.id);
        expect(resolved.status).toBe('approved');
        expect(resolved.memoryId).toBe(proposal.id);
        expect(resolved.reviewNote).toBe('confirmed in architecture doc');
        expect(resolved.reviewedAt).toBeTruthy();
        expect(store.stats().proposals.approved).toBe(1);
        expect(() => store.approveProposal(proposal.id)).toThrow('already approved');
    });

    it('rejects a proposal without creating a memory', () => {
        store = new ContextStore({ dbPath: ':memory:' });
        const proposal = store.proposeMemory(
            { content: 'store my password hunter2', scope: 'personal' },
            { proposedBy: 'agent-b' },
        );
        expect(store.rejectProposal(proposal.id, { reviewNote: 'never store secrets' })).toBe(true);
        expect(store.get(proposal.id)).toBeNull();
        const resolved = store.getProposal(proposal.id);
        expect(resolved.status).toBe('rejected');
        // Rejection is terminal.
        expect(store.rejectProposal(proposal.id)).toBe(false);
        expect(() => store.approveProposal(proposal.id)).toThrow('already rejected');
    });

    it('lists proposals filtered by status and proposer', () => {
        store = new ContextStore({ dbPath: ':memory:' });
        store.proposeMemory({ content: 'a' }, { proposedBy: 'agent-a' });
        store.proposeMemory({ content: 'b' }, { proposedBy: 'agent-b' });
        expect(store.listProposals({ proposedBy: 'agent-b' })).toHaveLength(1);
        expect(store.listProposals({ status: 'approved' })).toHaveLength(0);
        expect(store.listProposals({ status: null })).toHaveLength(2);
    });

    it('returns null for unknown approvals and validates proposal payloads', () => {
        store = new ContextStore({ dbPath: ':memory:' });
        expect(store.approveProposal('nonexistent')).toBeNull();
        expect(() => store.proposeMemory({ content: '' })).toThrow();
    });

    it('persists proposals across store reopenings (file vault)', { timeout: 30_000 }, async () => {
        const { mkdtempSync, rmSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const { join } = await import('node:path');
        const dir = mkdtempSync(join(tmpdir(), 'openself-proposals-'));
        try {
            store = new ContextStore({ dataDir: dir });
            const proposal = store.proposeMemory({ content: 'persisted proposal' });
            store.close();
            store = new ContextStore({ dataDir: dir });
            const loaded = store.getProposal(proposal.id);
            expect(loaded.status).toBe('pending');
            expect(loaded.memory.content).toBe('persisted proposal');
        } finally {
            store?.close();
            store = null;
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
