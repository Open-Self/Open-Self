/**
 * Safety Guard — boundary checks
 */
import { describe, it, expect } from 'vitest';
import { SafetyGuard } from '../../../src/safety/guard.js';

describe('SafetyGuard.checkReply', () => {
    it('blocks reply containing AI self-reveal', () => {
        const guard = new SafetyGuard({});
        const result = guard.checkReply("I'm an AI assistant", {}, {});
        expect(result.safe).toBe(false);
        expect(result.action).toBe('block');
        expect(result.issues.some(i => i.type === 'ai_reveal')).toBe(true);
    });

    it('queues reply containing sensitive info from neverShare', () => {
        const guard = new SafetyGuard({ neverShare: 'passwords, credit card' });
        const result = guard.checkReply('my passwords are 1234', {}, {});
        expect(result.safe).toBe(false);
        expect(result.action).toBe('queue_for_review');
        expect(result.issues.some(i => i.type === 'sensitive_info')).toBe(true);
    });

    it('deflects when incoming message contains avoided topic', () => {
        const guard = new SafetyGuard({
            avoidTopics: 'politics',
            deflectMessage: 'Thôi ko bàn cái này',
        });
        const result = guard.checkReply('sure thing', { text: 'what do you think about politics?' }, {});
        expect(result.safe).toBe(false);
        expect(result.action).toBe('deflect');
        expect(result.deflectMessage).toBe('Thôi ko bàn cái này');
    });

    it('passes clean reply with no issues', () => {
        const guard = new SafetyGuard({});
        const result = guard.checkReply('oke bro', { text: 'sup' }, { name: 'Alice', known: true });
        expect(result.safe).toBe(true);
    });

    it('notes unknown contact at low severity (no block)', () => {
        const guard = new SafetyGuard({});
        const result = guard.checkReply('hey', { text: 'hi' }, { name: 'Unknown', known: false });
        // Low severity unknown_contact should not block
        expect(result.safe).toBe(true);
        expect(result.issues.some(i => i.type === 'unknown_contact')).toBe(true);
    });

    it('defaults neverShare to built-in topics if not set', () => {
        const guard = new SafetyGuard({});
        // Default includes 'passwords'
        const result = guard.checkReply('my passwords are 1234', {}, {});
        expect(result.safe).toBe(false);
    });
});
