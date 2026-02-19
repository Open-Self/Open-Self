/**
 * OpenAI GPT Provider
 */

import OpenAI from 'openai';

export class OpenAIProvider {
    constructor(config = {}) {
        this.client = new OpenAI({
            apiKey: config.apiKey || process.env.OPENAI_API_KEY,
        });
        this.model = config.model || process.env.LLM_MODEL || 'gpt-4o-mini';
        this.maxTokens = config.maxTokens || 500;
    }

    async chat(systemPrompt, userMessage) {
        const response = await this.client.chat.completions.create({
            model: this.model,
            max_tokens: this.maxTokens,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage },
            ],
        });

        return response.choices[0]?.message?.content || '';
    }

    get name() {
        return 'openai';
    }
}
