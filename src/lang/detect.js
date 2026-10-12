/**
 * Language detection over a set of messages.
 * Scores each message against every registered language (script characters are a
 * strong signal, common function words a weaker one) and tallies the winner per
 * message. Returns the dominant language name, or a "Mixed (A x% / B y%)" label
 * when the top two are each used in more than 20% of messages.
 */

import { LANGUAGES } from './languages.js';

function scoreMessage(text) {
    const padded = ` ${text.toLowerCase()} `;
    let best = null;
    let bestScore = 0;
    for (const lang of LANGUAGES) {
        let score = 0;
        if (lang.chars && lang.chars.test(text)) score += 2;
        for (const word of lang.commonWords) {
            if (padded.includes(` ${word} `)) score += 1;
        }
        if (score > bestScore) {
            bestScore = score;
            best = lang.name;
        }
    }
    // No distinctive signal (no script chars, no common words) → undetermined,
    // rather than defaulting to English and skewing the tally.
    return best;
}

export function detectLanguage(texts) {
    if (!texts || texts.length === 0) return 'Unknown';

    const counts = new Map();
    let scored = 0;
    for (const text of texts) {
        const name = scoreMessage(text);
        if (!name) continue;
        scored++;
        counts.set(name, (counts.get(name) || 0) + 1);
    }

    if (scored === 0) return 'English'; // nothing distinctive anywhere

    const total = scored; // percentages over messages that carried a signal
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const [topName, topCount] = ranked[0];
    const [secondName, secondCount] = ranked[1] || [null, 0];

    const topPct = Math.round((topCount / total) * 100);
    const secondPct = Math.round((secondCount / total) * 100);

    if (secondName && topPct > 20 && secondPct > 20) {
        return `Mixed (${topName} ${topPct}% / ${secondName} ${secondPct}%)`;
    }
    return topName;
}
