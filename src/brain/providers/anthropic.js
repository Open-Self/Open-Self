/**
 * Anthropic Claude Provider
 */

import Anthropic from '@anthropic-ai/sdk';

export class AnthropicProvider {
    constructor(config = {}) {
        this.client = new Anthropic({
            apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
        });
        this.model = config.model || process.env.LLM_MODEL || 'claude-sonnet-4-20250514';
        this.maxTokens = config.maxTokens || 500;
    }

    async chat(systemPrompt, userMessage) {
        const response = await this.client.messages.create({
            model: this.model,
            max_tokens: this.maxTokens,
            system: systemPrompt,
            messages: [
                { role: 'user', content: userMessage },
            ],
        });

        return response.content[0]?.text || '';
    }

    get name() {
        return 'anthropic';
    }
}
