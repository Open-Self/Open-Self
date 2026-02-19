/**
 * LLM Provider Router
 * Routes to the configured LLM provider
 */

import { AnthropicProvider } from './providers/anthropic.js';
import { OpenAIProvider } from './providers/openai.js';
import { DeepSeekProvider } from './providers/deepseek.js';
import { OllamaProvider } from './providers/ollama.js';

const PROVIDERS = {
    anthropic: AnthropicProvider,
    openai: OpenAIProvider,
    deepseek: DeepSeekProvider,
    ollama: OllamaProvider,
};

/**
 * Create provider instance based on config/env
 */
export function createProvider(providerName, config = {}) {
    const name = (providerName || process.env.LLM_PROVIDER || 'anthropic').toLowerCase();

    const ProviderClass = PROVIDERS[name];
    if (!ProviderClass) {
        throw new Error(
            `Unknown LLM provider: "${name}". Available: ${Object.keys(PROVIDERS).join(', ')}`
        );
    }

    return new ProviderClass(config);
}

/**
 * Auto-detect provider from available API keys
 */
export function autoDetectProvider() {
    if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
    if (process.env.OPENAI_API_KEY) return 'openai';
    if (process.env.DEEPSEEK_API_KEY) return 'deepseek';
    if (process.env.OLLAMA_BASE_URL) return 'ollama';

    // Default fallback
    return 'ollama';
}

export { PROVIDERS };
