/**
 * Ghost Mode — Clone auto-replies when you're offline
 * Heartbeat-based presence detection
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const HEARTBEAT_FILE = 'heartbeat.json';
const OFFLINE_THRESHOLD = 5 * 60 * 1000; // 5 minutes

export class GhostMode {
    constructor(dataDir = './data') {
        this.dataDir = dataDir;
        this.heartbeatPath = join(dataDir, HEARTBEAT_FILE);
    }

    /**
     * Send heartbeat — "I'm online"
     */
    ping() {
        this._write({
            online: true,
            lastSeen: new Date().toISOString(),
            timestamp: Date.now(),
        });
    }

    /**
     * Check if user is offline (heartbeat stale)
     */
    isUserOffline() {
        const hb = this._read();
        if (!hb) return true; // No heartbeat = offline

        if (!hb.online) return true;

        const age = Date.now() - (hb.timestamp || 0);
        return age > OFFLINE_THRESHOLD;
    }

    /**
     * Enable ghost mode
     */
    enable() {
        this._write({
            online: false,
            ghostMode: true,
            enabledAt: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            timestamp: Date.now(),
        });
    }

    /**
     * Disable ghost mode — "I'm back"
     */
    disable() {
        this._write({
            online: true,
            ghostMode: false,
            disabledAt: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            timestamp: Date.now(),
        });
    }

    /**
     * Get current ghost status
     */
    getStatus() {
        const hb = this._read();
        if (!hb) return { ghostMode: false, online: false, status: 'unknown' };

        return {
            ghostMode: hb.ghostMode || false,
            online: hb.online || false,
            lastSeen: hb.lastSeen || 'never',
            isUserOffline: this.isUserOffline(),
            status: hb.ghostMode ? 'ghost' : (hb.online ? 'online' : 'offline'),
        };
    }

    /**
     * Should clone reply? (ghost mode + user offline)
     */
    shouldCloneReply() {
        const status = this.getStatus();
        return status.ghostMode && status.isUserOffline;
    }

    /**
     * Start heartbeat loop (ping every 2 minutes)
     */
    startHeartbeat(intervalMs = 120000) {
        this.ping();
        this._interval = setInterval(() => this.ping(), intervalMs);
        return this._interval;
    }

    stopHeartbeat() {
        if (this._interval) {
            clearInterval(this._interval);
            this._interval = null;
        }
    }

    _read() {
        try {
            if (existsSync(this.heartbeatPath)) {
                return JSON.parse(readFileSync(this.heartbeatPath, 'utf-8'));
            }
        } catch { /* corrupted */ }
        return null;
    }

    _write(data) {
        if (!existsSync(this.dataDir)) {
            mkdirSync(this.dataDir, { recursive: true });
        }
        writeFileSync(this.heartbeatPath, JSON.stringify(data, null, 2), 'utf-8');
    }
}
