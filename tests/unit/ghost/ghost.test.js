/**
 * GhostMode — heartbeat presence, enable/disable, status, reply gating
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { GhostMode } from '../../../src/ghost/ghost.js';

let dir;
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'openself-ghost-'));
});
afterEach(() => {
    vi.useRealTimers();
    rmSync(dir, { recursive: true, force: true });
});

describe('GhostMode presence', () => {
    it('reports offline when no heartbeat file exists', () => {
        const g = new GhostMode(dir);
        expect(g.isUserOffline()).toBe(true);
        expect(g.getStatus().status).toBe('unknown');
    });

    it('ping marks the user online and recent', () => {
        const g = new GhostMode(dir);
        g.ping();
        expect(g.isUserOffline()).toBe(false);
    });

    it('treats a stale heartbeat (> 5 min) as offline', () => {
        vi.useFakeTimers();
        const g = new GhostMode(dir);
        g.ping();
        vi.advanceTimersByTime(6 * 60 * 1000);
        expect(g.isUserOffline()).toBe(true);
    });
});

describe('GhostMode enable/disable/status', () => {
    it('enable sets ghost status and marks user not-online', () => {
        const g = new GhostMode(dir);
        g.enable();
        const s = g.getStatus();
        expect(s.ghostMode).toBe(true);
        expect(s.status).toBe('ghost');
    });

    it('disable clears ghost mode and marks online', () => {
        const g = new GhostMode(dir);
        g.enable();
        g.disable();
        const s = g.getStatus();
        expect(s.ghostMode).toBe(false);
        expect(s.status).toBe('online');
    });

    it('shouldCloneReply is true only in ghost mode with an offline user', () => {
        vi.useFakeTimers();
        const g = new GhostMode(dir);
        g.enable(); // ghost on, timestamp now
        vi.advanceTimersByTime(6 * 60 * 1000); // user goes stale/offline
        expect(g.shouldCloneReply()).toBe(true);

        g.disable();
        expect(g.shouldCloneReply()).toBe(false);
    });
});

describe('GhostMode heartbeat loop', () => {
    it('startHeartbeat pings immediately then on interval; stopHeartbeat clears it', () => {
        vi.useFakeTimers();
        const g = new GhostMode(dir);
        const pingSpy = vi.spyOn(g, 'ping');
        g.startHeartbeat(1000);
        expect(pingSpy).toHaveBeenCalledTimes(1); // immediate
        vi.advanceTimersByTime(3000);
        expect(pingSpy).toHaveBeenCalledTimes(4); // + 3 intervals
        g.stopHeartbeat();
        vi.advanceTimersByTime(3000);
        expect(pingSpy).toHaveBeenCalledTimes(4); // no more after stop
    });

    it('stopHeartbeat is safe to call when no loop is running', () => {
        const g = new GhostMode(dir);
        expect(() => g.stopHeartbeat()).not.toThrow();
    });
});
