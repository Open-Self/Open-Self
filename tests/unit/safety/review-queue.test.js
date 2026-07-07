/**
 * ReviewQueue — enqueue, pending filter, approve/reject transitions, persistence
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ReviewQueue } from '../../../src/safety/review-queue.js';

let dir;
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'openself-rq-'));
});
afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

describe('ReviewQueue add + getPending', () => {
    it('adds items with a generated id, timestamp and pending status', () => {
        const q = new ReviewQueue(dir);
        q.add({ contact: 'A', message: 'm', reply: 'r' });
        const pending = q.getPending();
        expect(pending).toHaveLength(1);
        expect(pending[0].status).toBe('pending');
        expect(pending[0].id).toBeTruthy();
        expect(pending[0].contact).toBe('A');
    });

    it('persists across instances (loads from disk)', () => {
        const q1 = new ReviewQueue(dir);
        q1.add({ contact: 'A', message: 'm', reply: 'r' });
        const q2 = new ReviewQueue(dir);
        expect(q2.getPending()).toHaveLength(1);
    });
});

describe('ReviewQueue approve/reject/stats', () => {
    it('approve moves an item out of pending', () => {
        const q = new ReviewQueue(dir);
        q.add({ contact: 'A', message: 'm', reply: 'r' });
        const id = q.getPending()[0].id;
        const item = q.approve(id);
        expect(item.status).toBe('approved');
        expect(q.getPending()).toHaveLength(0);
        expect(q.getStats()).toMatchObject({ pending: 0, approved: 1, total: 1 });
    });

    it('reject records the edited reply and marks rejected', () => {
        const q = new ReviewQueue(dir);
        q.add({ contact: 'A', message: 'm', reply: 'r' });
        const id = q.getPending()[0].id;
        const item = q.reject(id, 'better reply');
        expect(item.status).toBe('rejected');
        expect(item.editedReply).toBe('better reply');
        expect(q.getStats()).toMatchObject({ rejected: 1 });
    });

    it('approve/reject on an unknown id returns undefined and does not throw', () => {
        const q = new ReviewQueue(dir);
        expect(q.approve('nope')).toBeUndefined();
        expect(q.reject('nope', 'x')).toBeUndefined();
    });
});

describe('ReviewQueue corrupted store', () => {
    it('starts empty when the queue file is corrupted JSON', () => {
        writeFileSync(join(dir, 'review-queue.json'), '{ not json', 'utf-8');
        const q = new ReviewQueue(dir);
        expect(q.getPending()).toEqual([]);
    });
});
