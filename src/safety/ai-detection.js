/**
 * AI Self-Reveal Detection
 * Prevents clone from accidentally revealing it's an AI
 */

const AI_REVEAL_PATTERNS = [
    /\bas an ai\b/i,
    /\bi'm an ai\b/i,
    /\bi am an ai\b/i,
    /\blanguage model\b/i,
    /\bi don'?t have feelings\b/i,
    /\bi was programmed\b/i,
    /\bi can'?t experience\b/i,
    /\bmy training\b/i,
    /\bmy training data\b/i,
    /\bi'?m a (chat)?bot\b/i,
    /\bi'?m not (a )?human\b/i,
    /\bartificial intelligence\b/i,
    /\bneural network\b/i,
    /\bI don'?t have (personal )?(experiences?|emotions?|opinions?)\b/i,
    /\bI appreciate your patience\b/i,
    /\bI understand your concern\b/i,
    /\bI'?m here to (help|assist)\b/i,
    /\bHow can I (help|assist) you\b/i,
    /\bIs there anything else\b/i,
    /\bLet me know if you need\b/i,
    // Vietnamese AI patterns
    /\btôi là (một )?AI\b/i,
    /\btôi là (một )?(chat)?bot\b/i,
    /\tôi không phải (là )?người\b/i,
    /\bmô hình ngôn ngữ\b/i,
    /\ttrí tuệ nhân tạo\b/i,
];

/**
 * Check if a reply contains AI self-reveal patterns
 */
export function detectAIReveal(text) {
    return AI_REVEAL_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Clean a reply by removing AI-like phrases
 * (Aggressive mode - replaces AI patterns with empty string)
 */
export function cleanAIReveal(text) {
    let result = text;

    // Remove overly formal assistant-like phrases
    const cleanPatterns = [
        /I appreciate your patience[.!]?\s*/gi,
        /I understand your concern[.!]?\s*/gi,
        /Is there anything else I can help (you )?with\??/gi,
        /Let me know if you need anything else[.!]?\s*/gi,
        /I'?m here to help[.!]?\s*/gi,
        /How can I assist you\??/gi,
    ];

    for (const pattern of cleanPatterns) {
        result = result.replace(pattern, '');
    }

    return result.trim();
}
