/**
 * Config Loader
 * Load configuration from YAML, env, and defaults
 */

import { readFileSync, existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import dotenv from 'dotenv';

// Load .env file
dotenv.config();

const DEFAULT_CONFIG = {
    llm: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        maxTokens: 500,
    },
    clone: {
        proactiveMessages: false,
        replyDelay: { min: 30000, max: 300000 }, // 30s - 5min
        typingIndicator: true,
        readReceiptDelay: { min: 10000, max: 120000 }, // 10s - 2min
        onlineHours: { start: 8, end: 23 },
    },
    safety: {
        safeMode: true,
        reviewUnknownContacts: true,
    },
    data: {
        dir: './data',
        soulFile: 'SOUL.md',
        memoryFile: 'memory.md',
        reviewQueue: 'review-queue.json',
    },
};

/**
 * Load config from file + env + defaults
 */
export function loadConfig(configPath) {
    let fileConfig = {};

    // Try loading config file
    const paths = configPath ? [configPath] : ['./openself.yml', './openself.yaml', './config.yml'];
    for (const path of paths) {
        if (existsSync(path)) {
            try {
                const content = readFileSync(path, 'utf-8');
                fileConfig = parseYaml(content) || {};
                break;
            } catch {
                // Invalid YAML, skip
            }
        }
    }

    // Merge: defaults → file config → env vars
    const config = deepMerge(DEFAULT_CONFIG, fileConfig);

    // Override from env
    if (process.env.LLM_PROVIDER) config.llm.provider = process.env.LLM_PROVIDER;
    if (process.env.LLM_MODEL) config.llm.model = process.env.LLM_MODEL;
    if (process.env.DATA_DIR) config.data.dir = process.env.DATA_DIR;

    return config;
}

function deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = deepMerge(target[key] || {}, source[key]);
        } else {
            result[key] = source[key];
        }
    }
    return result;
}
