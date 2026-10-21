import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { compareContextLab, ContextLabError } from './lab.js';

const identity = Object.freeze({
    mode: 'simulation',
    transport: 'mock',
    liveAvailable: false,
});
const previewSchema = z
    .object({
        task: z.string().trim().min(1).max(2000),
        scope: z.string().trim().min(1).max(200).optional(),
        maxChars: z.number().int().min(500).max(16000).default(8000),
    })
    .strict();
const startSchema = z
    .object({
        previewId: z.string().uuid(),
        contextHash: z.string().regex(/^[a-f0-9]{64}$/),
        consent: z.literal(true),
    })
    .strict();

export class WorkspaceError extends Error {
    constructor(message, code, status = 400) {
        super(message);
        this.name = 'WorkspaceError';
        this.code = code;
        this.status = status;
    }
}

/** Local-only rehearsal. No transport injection, model, network, process, or vault writes. */
export class WorkspaceRehearsal {
    #previews = new Map();
    #runs = new Map();
    #closed = false;
    constructor(
        store,
        {
            now = Date.now,
            schedule = setTimeout,
            unschedule = clearTimeout,
            ttlMs = 10 * 60_000,
            capacity = 32,
        } = {},
    ) {
        this.store = store;
        this.now = now;
        this.schedule = schedule;
        this.unschedule = unschedule;
        this.ttlMs = ttlMs;
        this.capacity = capacity;
        this.cleanupTimer = setInterval(() => this.cleanup(), Math.min(ttlMs, 60_000));
        this.cleanupTimer.unref?.();
    }

    cleanup() {
        const now = this.now();
        for (const [id, preview] of this.#previews) {
            if (preview.expiresAt <= now) this.#previews.delete(id);
        }
        for (const [id, run] of this.#runs) {
            if (run.expiresAt <= now) {
                this.unschedule(run.timer);
                this.#runs.delete(id);
            }
        }
    }

    #ready() {
        if (this.#closed)
            throw new WorkspaceError('Workspace rehearsal is closed', 'WORKSPACE_CLOSED', 503);
        this.cleanup();
    }

    preview(input) {
        this.#ready();
        const parsed = previewSchema.parse(input);
        if (this.#previews.size >= this.capacity) {
            throw new WorkspaceError(
                'Too many previews. Wait for an older preview to expire.',
                'WORKSPACE_CAPACITY',
                429,
            );
        }
        const request = {
            task: parsed.task,
            scope: parsed.scope,
            retrieval: 'lexical',
            budget: { maxChars: parsed.maxChars },
            explain: true,
        };
        // Default policy is private, not the dashboard owner's unrestricted diagnostics.
        const result = compareContextLab(
            this.store,
            { a: request, b: request },
            { diagnostics: false },
        );
        const preview = {
            ...identity,
            previewId: randomUUID(),
            state: 'preview',
            task: parsed.task,
            contextHash: result.a.contextHash,
            context: result.a,
            expiresAt: this.now() + this.ttlMs,
        };
        this.#previews.set(preview.previewId, { ...preview, request, baseline: result.baseline });
        return structuredClone(preview);
    }

    start(input) {
        this.#ready();
        const parsed = startSchema.parse(input);
        const preview = this.#previews.get(parsed.previewId);
        if (!preview)
            throw new WorkspaceError(
                'Preview expired or not found. Preview again.',
                'WORKSPACE_PREVIEW_NOT_FOUND',
                404,
            );
        if (preview.contextHash !== parsed.contextHash) {
            throw new WorkspaceError(
                'Context confirmation does not match the preview.',
                'WORKSPACE_HASH_MISMATCH',
                409,
            );
        }
        // Double-clicks are idempotent, never a second run.
        if (preview.runId) return this.get(preview.runId);
        if (this.#runs.size >= this.capacity) {
            throw new WorkspaceError(
                'Too many rehearsals. Wait for an older run to expire.',
                'WORKSPACE_CAPACITY',
                429,
            );
        }
        let result;
        try {
            result = compareContextLab(
                this.store,
                { a: preview.request, b: preview.request, baseline: preview.baseline },
                { diagnostics: false },
            );
        } catch (error) {
            if (error instanceof ContextLabError) {
                throw new WorkspaceError(
                    'Vault changed. Preview again before starting.',
                    'WORKSPACE_BASELINE_CHANGED',
                    409,
                );
            }
            throw error;
        }
        if (result.a.contextHash !== preview.contextHash) {
            throw new WorkspaceError(
                'Context changed. Preview again before starting.',
                'WORKSPACE_HASH_MISMATCH',
                409,
            );
        }
        const run = {
            ...identity,
            id: randomUUID(),
            previewId: preview.previewId,
            state: 'running',
            contextHash: preview.contextHash,
            output: '',
            events: [],
            createdAt: this.now(),
            expiresAt: this.now() + this.ttlMs,
            chars: preview.context.context.length,
            step: 0,
        };
        this.#runs.set(run.id, run);
        preview.runId = run.id;
        this.#schedule(run);
        return this.#snapshot(run);
    }

    #schedule(run) {
        try {
            run.timer = this.schedule(() => this.#tick(run), 250);
            run.timer?.unref?.();
        } catch {
            run.state = 'error';
            run.output = 'Simulation could not run. No model ran; no vault content was changed.';
        }
    }

    #tick(run) {
        this.cleanup();
        if (this.#closed || this.#runs.get(run.id) !== run || run.state !== 'running') return;
        const chunks = [
            'Simulation only: ',
            `mock transport received ${run.chars} context characters; `,
            'no model ran. No task was performed and nothing was saved to the vault.',
        ];
        const text = chunks[run.step++];
        run.output += text;
        run.events.push({ sequence: run.step, type: 'mock-output', text });
        if (run.step === chunks.length) {
            run.state = 'completed';
            run.proposal = {
                state: 'pending',
                content: 'Simulation-only placeholder. No AI-generated memory was created.',
                storedInVault: false,
            };
        } else this.#schedule(run);
    }

    #snapshot(run) {
        const { timer: _timer, chars: _chars, step: _step, ...snapshot } = run;
        return structuredClone(snapshot);
    }

    get(id) {
        this.#ready();
        const run = this.#runs.get(id);
        if (!run)
            throw new WorkspaceError(
                'Rehearsal expired or not found',
                'WORKSPACE_RUN_NOT_FOUND',
                404,
            );
        return this.#snapshot(run);
    }

    cancel(id) {
        this.#ready();
        const run = this.#runs.get(id);
        if (!run)
            throw new WorkspaceError(
                'Rehearsal expired or not found',
                'WORKSPACE_RUN_NOT_FOUND',
                404,
            );
        if (run.state === 'running') {
            run.state = 'cancelled';
            this.unschedule(run.timer);
        }
        return this.#snapshot(run);
    }

    decideProposal(id, input) {
        this.#ready();
        const { decision } = z
            .object({ decision: z.enum(['approve', 'reject']) })
            .strict()
            .parse(input);
        const run = this.#runs.get(id);
        if (!run)
            throw new WorkspaceError(
                'Rehearsal expired or not found',
                'WORKSPACE_RUN_NOT_FOUND',
                404,
            );
        if (run.state !== 'completed' || !run.proposal) {
            throw new WorkspaceError(
                'Complete the simulation before reviewing its placeholder.',
                'WORKSPACE_PROPOSAL_NOT_READY',
                409,
            );
        }
        const next = decision === 'approve' ? 'approved' : 'rejected';
        if (run.proposal.state !== 'pending' && run.proposal.state !== next) {
            throw new WorkspaceError(
                'Simulation placeholder already reviewed.',
                'WORKSPACE_PROPOSAL_REVIEWED',
                409,
            );
        }
        run.proposal.state = next;
        return this.#snapshot(run);
    }

    close() {
        this.#closed = true;
        clearInterval(this.cleanupTimer);
        for (const run of this.#runs.values()) this.unschedule(run.timer);
        this.#runs.clear();
        this.#previews.clear();
    }
}
