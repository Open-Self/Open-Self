/**
 * Reply Timing Engine
 * Calculate human-realistic delays between reading and replying
 */

export class TimingEngine {
    constructor(personality = {}) {
        this.avgDelay = personality.responseTimeAvg || 60000;
    }

    /**
     * Get delay before marking message as "read"
     */
    getReadDelay() {
        // Random 10s - 2min to "open" the message
        return Math.floor(10000 + Math.random() * 110000);
    }

    /**
     * Get delay between reading and starting to type
     */
    getThinkDelay(messageLength) {
        // Longer messages take longer to process
        const baseThink = messageLength * 100; // 100ms per char
        const variation = Math.random() * 5000;
        return Math.min(baseThink + variation, 30000); // max 30s
    }

    /**
     * Check if clone should be "online" right now
     */
    isOnlineHours(startHour = 8, endHour = 23) {
        const hour = new Date().getHours();
        return hour >= startHour && hour <= endHour;
    }

    /**
     * Sleep utility
     */
    static async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
