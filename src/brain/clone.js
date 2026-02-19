/**
 * Clone Brain — System Prompt Builder
 * Constructs dynamic prompts that make the LLM behave as the user's personality clone
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export class CloneBrain {
    constructor(soulContent, config = {}) {
        this.soul = parseSoulMd(soulContent);
        this.config = config;
    }

    /**
     * Build the full system prompt for a given contact and context
     */
    buildSystemPrompt(contact = {}, recentHistory = '', ragContext = '') {
        const soul = this.soul;
        const channel = contact.channel || 'messaging app';

        return `You are ${soul.name || 'the user'}. You are NOT an AI assistant. You ARE this person.
You are chatting on ${channel}.

CRITICAL RULES:
- You MUST speak EXACTLY like ${soul.name || 'this person'}. Copy their style perfectly.
- NEVER say "as an AI" or "I'm an AI" or anything that reveals you're not human.
- NEVER be more helpful or articulate than the real person would be.
- Match message length (avg: ${soul.avgMessageLength || '15'} chars).
- Match emoji usage (${soul.emojiFrequency || 'moderate'}).
- Use their catchphrases naturally: ${soul.catchphrases || 'none specified'}
- Use their abbreviations: ${soul.abbreviations || 'none specified'}
- Reply in ${soul.language || 'the same language as the incoming message'}

PERSONALITY PROFILE:
${soul.rawContent || 'No personality data loaded.'}

YOU ARE TALKING TO: ${contact.name || 'Unknown'}
YOUR RELATIONSHIP: ${contact.relationship || 'unknown'}
SPECIAL RULES FOR THIS PERSON: ${contact.rules || 'none'}

${recentHistory ? `RECENT CONVERSATION CONTEXT:\n${recentHistory}` : ''}

${ragContext ? `RELEVANT PAST CONVERSATIONS:\n${ragContext}` : ''}

BOUNDARIES:
- Topics to avoid: ${soul.avoidTopics || 'politics, religion'}
- When unsure: "${soul.unsureFallback || 'Let me check on that'}"
- Never share: ${soul.neverShare || 'personal finances, health info, passwords'}

RESPONSE FORMAT:
- Just the message text. No quotes, no labels, no formatting.
- If multiple messages needed, separate with |||
- Keep it natural and conversational. Match the person's typical message length.
- Do NOT over-explain or be overly polite unless the person normally is.`.trim();
    }

    /**
     * Generate a reply for an incoming message
     */
    async generateReply(message, contact, provider, options = {}) {
        const systemPrompt = this.buildSystemPrompt(
            contact,
            options.recentHistory || '',
            options.ragContext || '',
        );

        const response = await provider.chat(systemPrompt, message);
        return response;
    }
}

/**
 * Parse SOUL.md content into structured data
 */
function parseSoulMd(content) {
    const soul = {
        rawContent: content,
        name: '',
        language: '',
        avgMessageLength: '',
        emojiFrequency: '',
        catchphrases: '',
        abbreviations: '',
        avoidTopics: '',
        unsureFallback: '',
        neverShare: '',
    };

    // Extract key fields from markdown
    const nameMatch = content.match(/- Name:\s*(.+)/);
    if (nameMatch) soul.name = nameMatch[1].trim();

    const langMatch = content.match(/- Language:\s*(.+)/);
    if (langMatch) soul.language = langMatch[1].trim();

    const avgLenMatch = content.match(/- Average message length:\s*(.+)/);
    if (avgLenMatch) soul.avgMessageLength = avgLenMatch[1].trim();

    const emojiMatch = content.match(/- Emoji frequency:\s*(.+)/);
    if (emojiMatch) soul.emojiFrequency = emojiMatch[1].trim();

    const catchMatch = content.match(/- Catchphrases:\s*(.+)/);
    if (catchMatch) soul.catchphrases = catchMatch[1].trim();

    const abbrMatch = content.match(/- Abbreviations:\s*(.+)/);
    if (abbrMatch) soul.abbreviations = abbrMatch[1].trim();

    const avoidMatch = content.match(/- Deflect topics:\s*(.+)/);
    if (avoidMatch) soul.avoidTopics = avoidMatch[1].trim();

    const fallbackMatch = content.match(/- (?:When unsure|fallback):\s*(?:Say\s+)?"?([^"]+)"?/);
    if (fallbackMatch) soul.unsureFallback = fallbackMatch[1].trim();

    const neverMatch = content.match(/- Never share:\s*(.+)/);
    if (neverMatch) soul.neverShare = neverMatch[1].trim();

    return soul;
}

/**
 * Load SOUL.md from data directory
 */
export function loadSoul(dataDir = './data') {
    const soulPath = join(dataDir, 'SOUL.md');
    if (!existsSync(soulPath)) {
        throw new Error(`SOUL.md not found at ${soulPath}. Run 'openself feed' first.`);
    }
    return readFileSync(soulPath, 'utf-8');
}
