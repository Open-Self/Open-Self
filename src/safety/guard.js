/**
 * Safety Guard
 * Enforces boundaries before sending any reply
 */

import { detectAIReveal } from './ai-detection.js';

export class SafetyGuard {
    constructor(soul = {}) {
        this.soul = soul;
    }

    /**
     * Check a reply before sending — returns safety verdict
     */
    checkReply(reply, message = {}, contact = {}) {
        const issues = [];

        // 1. AI self-reveal check
        if (detectAIReveal(reply)) {
            issues.push({ type: 'ai_reveal', severity: 'critical' });
        }

        // 2. Sensitive info leak
        const neverShare = this.soul.neverShare || 'personal finances, health info, passwords';
        const neverShareTopics = neverShare.split(',').map(s => s.trim().toLowerCase());
        for (const topic of neverShareTopics) {
            if (topic && reply.toLowerCase().includes(topic)) {
                issues.push({ type: 'sensitive_info', topic, severity: 'high' });
            }
        }

        // 3. Avoided topics in incoming message
        const avoidTopics = this.soul.avoidTopics || '';
        const avoidList = avoidTopics.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        for (const topic of avoidList) {
            if (message.text && message.text.toLowerCase().includes(topic)) {
                const deflect = this.soul.deflectMessage || this.soul.unsureFallback || 'Thôi ko bàn cái này 😅';
                return {
                    safe: false,
                    action: 'deflect',
                    deflectMessage: deflect,
                    issues: [{ type: 'avoided_topic', topic, severity: 'medium' }],
                };
            }
        }

        // 4. Unknown contact → caution mode
        if (!contact.known && contact.name === 'Unknown') {
            issues.push({ type: 'unknown_contact', severity: 'low' });
        }

        // Determine action
        if (issues.some(i => i.severity === 'critical')) {
            return { safe: false, action: 'block', issues };
        }
        if (issues.some(i => i.severity === 'high')) {
            return { safe: false, action: 'queue_for_review', issues };
        }

        return { safe: true, issues };
    }
}
