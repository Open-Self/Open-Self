/**
 * Human Mimicry Engine
 * Makes clone behave like a real human, not a bot
 */

export class HumanMimicry {
    constructor(personality = {}) {
        this.personality = personality;
    }

    /**
     * Calculate reply delay to mimic human behavior
     */
    getReplyDelay(message, contact = {}) {
        const baseDelay = this.personality.responseTimeAvg || 60000; // default 1 min
        const messageLength = message.length;

        // Reading time: ~50ms per char
        const readTime = messageLength * 50;

        // Random variation ±40%
        const variation = baseDelay * (0.6 + Math.random() * 0.8);

        // Close friends → faster replies
        const relationshipFactor = contact.closeness === 'close' ? 0.5
            : contact.closeness === 'family' ? 0.7
                : 1;

        const delay = (readTime + variation) * relationshipFactor;

        return Math.min(Math.max(delay, 5000), 5 * 60 * 1000); // 5s to 5min
    }

    /**
     * Calculate typing duration for "typing..." indicator
     */
    getTypingDuration(reply) {
        // ~80ms per char typing speed + some random variation
        return Math.min(reply.length * 80 * (0.8 + Math.random() * 0.4), 10000);
    }

    /**
     * Decide whether to ignore a message (like a real human would)
     */
    shouldIgnore(message = {}) {
        // Group chat, not mentioned → 70% ignore
        if (message.isGroup && !message.mentionsMe) {
            return Math.random() < 0.7;
        }

        // Media without caption → 50% just react
        if (message.isMedia && !message.hasCaption) {
            return Math.random() < 0.5;
        }

        // Outside active hours → ignore
        const hour = new Date().getHours();
        const onlineStart = this.personality.onlineHoursStart || 8;
        const onlineEnd = this.personality.onlineHoursEnd || 23;
        if (hour < onlineStart || hour > onlineEnd) {
            return true;
        }

        return false;
    }

    /**
     * Optionally add typos (if person tends to have them)
     */
    addTypos(reply) {
        const typoRate = this.personality.typoRate || 0.02;
        if (typoRate < 0.01) return reply;

        // Small chance of a typo
        if (Math.random() > 0.1) return reply;

        // Swap 2 adjacent chars
        const chars = reply.split('');
        const pos = Math.floor(Math.random() * Math.max(chars.length - 2, 1)) + 1;
        if (pos < chars.length - 1) {
            [chars[pos], chars[pos + 1]] = [chars[pos + 1], chars[pos]];
        }
        return chars.join('');
    }

    /**
     * Split long reply into multiple messages (like humans do)
     */
    splitMessage(reply) {
        if (reply.length < 80) return [reply];

        // Model may have already split with |||
        if (reply.includes('|||')) {
            return reply.split('|||').map(s => s.trim()).filter(Boolean);
        }

        // Don't split short messages
        if (reply.length < 150) return [reply];

        // Split at natural break points
        const parts = reply.split(/(?<=[.!?])\s+/).filter(Boolean);
        if (parts.length <= 1) return [reply];

        // Group into chunks of reasonable size
        const messages = [];
        let current = '';
        for (const part of parts) {
            if (current.length + part.length > 120 && current) {
                messages.push(current.trim());
                current = part;
            } else {
                current += (current ? ' ' : '') + part;
            }
        }
        if (current.trim()) messages.push(current.trim());

        return messages;
    }

    /**
     * Apply all human-like post-processing to a reply
     */
    processReply(reply) {
        let result = reply.trim();

        // Optional typos
        result = this.addTypos(result);

        // Split into multiple messages
        const messages = this.splitMessage(result);

        return messages;
    }
}
