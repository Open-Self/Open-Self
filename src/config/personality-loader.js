/**
 * Personality Loader — bridges extractor (data/personality.json) into
 * the runtime mimicry/style modules. Without this, numeric stats produced
 * by `feed` are silently lost: SOUL.md parser only extracts strings, so
 * mimicry/style fall back to hard-coded defaults regardless of training.
 *
 * Returns a merged object: SOUL.md-parsed fields (string semantics)
 * overlaid with personality.json numeric fields (mimicry semantics).
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Numeric/structured keys that should always come from personality.json
// when present (these drive timing, length, style behaviour at runtime).
const NUMERIC_KEYS = [
    'responseTimeAvg',
    'avgMessageLength',
    'avgWordCount',
    'emojiFrequency',
    'typoRate',
    'onlineHoursStart',
    'onlineHoursEnd',
    'capitalizationStyle',
];

export function loadPersonality(dataDir = './data') {
    const path = join(dataDir, 'personality.json');
    if (!existsSync(path)) return {};
    try {
        return JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
        return {};
    }
}

/**
 * Merge SOUL.md parsed object with personality.json.
 *
 * Strategy:
 *   - Start with soulParsed (string fields like name, language, catchphrases)
 *   - Overlay numeric/stat fields from personality.json (drives mimicry timing
 *     + style adjustments). Avoids the silent default-fallback bug where
 *     parseSoulMd never set responseTimeAvg/typoRate/onlineHours.
 *   - Coerce avgMessageLength to a number (SOUL.md may store "47 chars").
 */
export function mergePersonality(soulParsed = {}, personalityJson = {}) {
    const merged = { ...soulParsed };
    for (const key of NUMERIC_KEYS) {
        if (personalityJson[key] !== undefined && personalityJson[key] !== null) {
            merged[key] = personalityJson[key];
        }
    }
    if (typeof merged.avgMessageLength === 'string') {
        const n = parseInt(merged.avgMessageLength, 10);
        if (!Number.isNaN(n)) merged.avgMessageLength = n;
    }
    if (Array.isArray(personalityJson.catchphrases) && personalityJson.catchphrases.length) {
        if (!merged.catchphrases) {
            merged.catchphrases = personalityJson.catchphrases.join(', ');
        }
    }
    if (Array.isArray(personalityJson.abbreviations) && personalityJson.abbreviations.length) {
        if (!merged.abbreviations) {
            merged.abbreviations = personalityJson.abbreviations.join(', ');
        }
    }
    return merged;
}
