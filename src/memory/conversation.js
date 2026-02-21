/**
 * Conversation Memory — Per-contact context tracking
 * Keeps track of recent exchanges for coherent multi-turn conversations
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export class ConversationMemory {
    constructor(dataDir = './data') {
        this.dataDir = dataDir;
        this.memoryFile = join(dataDir, 'memory.md');
        this.sessions = new Map(); // In-memory per-contact sessions
    }

    /**
     * Add a message exchange to the conversation context
     */
    addExchange(contact, theirMessage, cloneReply) {
        if (!this.sessions.has(contact)) {
            this.sessions.set(contact, []);
        }

        const session = this.sessions.get(contact);
        session.push({
            timestamp: new Date().toISOString(),
            them: theirMessage,
            clone: cloneReply,
        });

        // Keep only last 20 exchanges per contact (sliding window)
        if (session.length > 20) {
            session.splice(0, session.length - 20);
        }

        // Persist to memory.md
        this._appendToFile(contact, theirMessage, cloneReply);
    }

    /**
     * Get recent conversation context for a contact
     */
    getRecentContext(contact, maxExchanges = 10) {
        const session = this.sessions.get(contact);
        if (!session || session.length === 0) return '';

        const recent = session.slice(-maxExchanges);
        return recent
            .map(ex => `${contact}: ${ex.them}\nYou: ${ex.clone}`)
            .join('\n\n');
    }

    /**
     * Get all active contacts
     */
    getActiveContacts() {
        const contacts = [];
        for (const [name, session] of this.sessions) {
            contacts.push({
                name,
                messageCount: session.length,
                lastMessage: session[session.length - 1]?.timestamp || '',
            });
        }
        return contacts.sort((a, b) => b.lastMessage.localeCompare(a.lastMessage));
    }

    /**
     * Clear session for a contact
     */
    clearSession(contact) {
        this.sessions.delete(contact);
    }

    /**
     * Append exchange to memory.md (long-term memory)
     */
    _appendToFile(contact, theirMessage, cloneReply) {
        if (!existsSync(this.dataDir)) {
            mkdirSync(this.dataDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
        const entry = `\n## ${timestamp} — ${contact}\n- **Them:** ${theirMessage}\n- **Clone:** ${cloneReply}\n`;

        try {
            let content = '';
            if (existsSync(this.memoryFile)) {
                content = readFileSync(this.memoryFile, 'utf-8');
            } else {
                content = '# OpenSelf — Conversation Memory\n\nAuto-generated log of clone conversations.\n';
            }
            writeFileSync(this.memoryFile, content + entry, 'utf-8');
        } catch {
            // Non-critical, don't crash
        }
    }

    /**
     * Load memory.md summary
     */
    getMemorySummary() {
        if (!existsSync(this.memoryFile)) return null;

        try {
            const content = readFileSync(this.memoryFile, 'utf-8');
            const lines = content.split('\n');
            const exchanges = lines.filter(l => l.startsWith('## ')).length;
            return {
                file: this.memoryFile,
                totalExchanges: exchanges,
                sizeBytes: Buffer.byteLength(content),
            };
        } catch {
            return null;
        }
    }
}
