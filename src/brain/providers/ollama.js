/**
 * Ollama Local Provider
 * Uses Ollama's HTTP API for local LLM inference
 */

export class OllamaProvider {
    constructor(config = {}) {
        this.baseURL = config.baseURL || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
        this.model = config.model || process.env.LLM_MODEL || 'llama3.2';
        this.maxTokens = config.maxTokens || 500;
    }

    async chat(systemPrompt, userMessage) {
        const response = await fetch(`${this.baseURL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.model,
                stream: false,
                options: {
                    num_predict: this.maxTokens,
                },
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage },
                ],
            }),
        });

        if (!response.ok) {
            throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.message?.content || '';
    }

    get name() {
        return 'ollama';
    }
}
