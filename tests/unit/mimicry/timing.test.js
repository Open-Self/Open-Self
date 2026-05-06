/**
 * TimingEngine — read delay, think delay, online hours
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { TimingEngine } from '../../../src/mimicry/timing.js';

afterEach(() => {
    vi.useRealTimers();
});

describe('TimingEngine constructor', () => {
    it('uses responseTimeAvg from personality', () => {
        const t = new TimingEngine({ responseTimeAvg: 45000 });
        expect(t.avgDelay).toBe(45000);
    });

    it('defaults to 60000 when responseTimeAvg not provided', () => {
        const t = new TimingEngine({});
        expect(t.avgDelay).toBe(60000);
    });
});

describe('getReadDelay', () => {
    it('returns value between 10000 and 120000 ms', () => {
        const t = new TimingEngine({});
        for (let i = 0; i < 10; i++) {
            const d = t.getReadDelay();
            expect(d).toBeGreaterThanOrEqual(10000);
            expect(d).toBeLessThanOrEqual(120000);
        }
    });

    it('returns an integer', () => {
        const t = new TimingEngine({});
        expect(Number.isInteger(t.getReadDelay())).toBe(true);
    });
});

describe('getThinkDelay', () => {
    it('returns positive value for non-zero message length', () => {
        const t = new TimingEngine({});
        expect(t.getThinkDelay(50)).toBeGreaterThan(0);
    });

    it('caps at 30000ms for very long messages', () => {
        const t = new TimingEngine({});
        expect(t.getThinkDelay(10000)).toBeLessThanOrEqual(30000);
    });

    it('scales with message length (longer → more)', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const t = new TimingEngine({});
        const shortDelay = t.getThinkDelay(10);
        const longDelay = t.getThinkDelay(100);
        expect(longDelay).toBeGreaterThanOrEqual(shortDelay);
        vi.restoreAllMocks();
    });
});

describe('isOnlineHours', () => {
    it('returns true at noon (default 8-23 window)', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-12T12:00:00'));
        const t = new TimingEngine({});
        expect(t.isOnlineHours()).toBe(true);
    });

    it('returns false at 3am (outside 8-23 window)', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-12T03:00:00'));
        const t = new TimingEngine({});
        expect(t.isOnlineHours()).toBe(false);
    });

    it('returns true at boundary start hour (8am)', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-12T08:00:00'));
        const t = new TimingEngine({});
        expect(t.isOnlineHours(8, 23)).toBe(true);
    });

    it('returns true at boundary end hour (23)', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-12T23:00:00'));
        const t = new TimingEngine({});
        expect(t.isOnlineHours(8, 23)).toBe(true);
    });
});

describe('TimingEngine.sleep', () => {
    it('is a static method returning a Promise', () => {
        vi.useFakeTimers();
        const p = TimingEngine.sleep(100);
        expect(p).toBeInstanceOf(Promise);
        vi.runAllTimers();
    });
});
