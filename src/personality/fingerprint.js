/**
 * Vocabulary Fingerprinter
 * Create a unique "fingerprint" of how someone writes
 */

export function createFingerprint(texts) {
    return {
        uniqueWords: getUniqueWordRatio(texts),
        avgWordLength: getAvgWordLength(texts),
        punctuationStyle: analyzePunctuation(texts),
        capitalizationStyle: analyzeCapitalization(texts),
        messageEndStyle: analyzeMessageEndings(texts),
        questionFrequency: getQuestionFrequency(texts),
        exclamationFrequency: getExclamationFrequency(texts),
    };
}

function getUniqueWordRatio(texts) {
    const allWords = [];
    const uniqueWords = new Set();

    for (const text of texts) {
        const words = text.toLowerCase().split(/\s+/);
        for (const word of words) {
            const clean = word.replace(/[^\p{L}\p{N}]/gu, '');
            if (clean) {
                allWords.push(clean);
                uniqueWords.add(clean);
            }
        }
    }

    return allWords.length > 0
        ? Math.round((uniqueWords.size / allWords.length) * 100) / 100
        : 0;
}

function getAvgWordLength(texts) {
    const wordLengths = [];

    for (const text of texts) {
        const words = text.split(/\s+/);
        for (const word of words) {
            const clean = word.replace(/[^\p{L}\p{N}]/gu, '');
            if (clean) wordLengths.push(clean.length);
        }
    }

    if (wordLengths.length === 0) return 0;
    return Math.round(wordLengths.reduce((a, b) => a + b, 0) / wordLengths.length * 10) / 10;
}

function analyzePunctuation(texts) {
    let dots = 0, commas = 0, exclamations = 0, questions = 0, ellipsis = 0;

    for (const text of texts) {
        dots += (text.match(/\./g) || []).length;
        commas += (text.match(/,/g) || []).length;
        exclamations += (text.match(/!/g) || []).length;
        questions += (text.match(/\?/g) || []).length;
        ellipsis += (text.match(/\.\.\./g) || []).length;
    }

    return { dots, commas, exclamations, questions, ellipsis };
}

function analyzeCapitalization(texts) {
    let allCaps = 0, noCaps = 0, normalCaps = 0;

    for (const text of texts) {
        if (text === text.toUpperCase() && /[A-Z]/.test(text)) allCaps++;
        else if (text === text.toLowerCase()) noCaps++;
        else normalCaps++;
    }

    if (allCaps > noCaps && allCaps > normalCaps) return 'ALL_CAPS';
    if (noCaps > allCaps && noCaps > normalCaps) return 'lowercase';
    return 'Normal';
}

function analyzeMessageEndings(texts) {
    const endings = {};

    for (const text of texts) {
        const trimmed = text.trim();
        if (!trimmed) continue;

        const lastChar = trimmed[trimmed.length - 1];
        // Check for emoji ending
        const emojiMatch = trimmed.match(/[\u{1F600}-\u{1F9FF}]$/u);
        const key = emojiMatch ? 'emoji' : lastChar;

        endings[key] = (endings[key] || 0) + 1;
    }

    return Object.entries(endings)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([char, count]) => ({ char, count }));
}

function getQuestionFrequency(texts) {
    let questions = 0;
    for (const text of texts) {
        if (text.includes('?')) questions++;
    }
    return Math.round((questions / Math.max(texts.length, 1)) * 100) / 100;
}

function getExclamationFrequency(texts) {
    let exclamations = 0;
    for (const text of texts) {
        if (text.includes('!')) exclamations++;
    }
    return Math.round((exclamations / Math.max(texts.length, 1)) * 100) / 100;
}
