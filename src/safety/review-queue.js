/**
 * Review Queue
 * Store messages that need human review before sending
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const QUEUE_FILE = 'review-queue.json';

export class ReviewQueue {
    constructor(dataDir = './data') {
        this.dataDir = dataDir;
        this.filePath = join(dataDir, QUEUE_FILE);
        this.queue = this._load();
    }

    /**
     * Add item to review queue
     */
    add(item) {
        this.queue.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            timestamp: new Date().toISOString(),
            status: 'pending',
            ...item,
        });
        this._save();
    }

    /**
     * Get all pending items
     */
    getPending() {
        return this.queue.filter(item => item.status === 'pending');
    }

    /**
     * Approve an item (mark as sent)
     */
    approve(id) {
        const item = this.queue.find(i => i.id === id);
        if (item) {
            item.status = 'approved';
            item.reviewedAt = new Date().toISOString();
            this._save();
        }
        return item;
    }

    /**
     * Reject an item
     */
    reject(id, editedReply) {
        const item = this.queue.find(i => i.id === id);
        if (item) {
            item.status = 'rejected';
            item.editedReply = editedReply;
            item.reviewedAt = new Date().toISOString();
            this._save();
        }
        return item;
    }

    /**
     * Get summary stats
     */
    getStats() {
        const pending = this.queue.filter(i => i.status === 'pending').length;
        const approved = this.queue.filter(i => i.status === 'approved').length;
        const rejected = this.queue.filter(i => i.status === 'rejected').length;
        return { pending, approved, rejected, total: this.queue.length };
    }

    _load() {
        try {
            if (existsSync(this.filePath)) {
                return JSON.parse(readFileSync(this.filePath, 'utf-8'));
            }
        } catch {
            // Corrupted file, start fresh
        }
        return [];
    }

    _save() {
        if (!existsSync(this.dataDir)) {
            mkdirSync(this.dataDir, { recursive: true });
        }
        writeFileSync(this.filePath, JSON.stringify(this.queue, null, 2), 'utf-8');
    }
}
