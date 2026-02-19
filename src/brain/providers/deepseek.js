/**
 * DeepSeek Provider (OpenAI-compatible API)
 */

import OpenAI from 'openai';

export class DeepSeekProvider {
    constructor(config = {}) {
        this.client = new OpenAI({
            apiKey: config.apiKey || process.env.DEEPSEEK_API_KEY,
            baseURL: config.baseURL || 'https://api.deepseek.com/v1',
        });
        this.model = config.model || 'deepseek-chat';
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
        return 'deepseek';
    }
}
