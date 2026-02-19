/**
 * Style Post-processor
 * Ensures clone's reply matches the user's writing style
 */

export class StyleProcessor {
    constructor(personality = {}) {
        this.personality = personality;
    }

    /**
     * Adjust reply to match user's typical message length
     */
    adjustLength(reply) {
        const targetLength = this.personality.avgMessageLength || 50;

        // If the reply is way too long, truncate naturally
        if (reply.length > targetLength * 3 && targetLength < 100) {
            // Find a natural cut point
            const cutPoint = reply.indexOf('.', targetLength);
            if (cutPoint > 0 && cutPoint < reply.length * 0.7) {
                return reply.substring(0, cutPoint + 1);
            }
        }

        return reply;
    }

    /**
     * Apply user's capitalization style
     */
    applyCapitalization(reply) {
        const style = this.personality.capitalizationStyle || 'Normal';

        switch (style) {
            case 'lowercase':
                return reply.toLowerCase();
            case 'ALL_CAPS':
                return reply.toUpperCase();
            default:
                return reply;
        }
    }

    /**
     * Full post-processing pipeline
     */
    process(reply) {
        let result = reply;
        result = this.adjustLength(result);
        result = this.applyCapitalization(result);
        return result;
    }
}
