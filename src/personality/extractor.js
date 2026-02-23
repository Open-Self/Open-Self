/**
 * Personality Extractor — Analyze chat messages to extract personality traits
 */

// Common emoji regex
const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;

export function extractPersonality(yourMessages, conversations = []) {
    const texts = yourMessages.map(m => m.text);

    return {
        // Basic stats
        totalMessages: texts.length,
        avgMessageLength: average(texts.map(t => t.length)),
        avgWordCount: average(texts.map(t => t.split(/\s+/).length)),

        // Emoji analysis
        emojiFrequency: countEmojis(texts) / Math.max(texts.length, 1),
        topEmojis: getTopEmojis(texts, 10),

        // Language patterns
        topWords: getTopWords(texts, 50),
        topPhrases: getTopPhrases(texts, 30),
        catchphrases: detectCatchphrases(texts),
        greetingStyle: detectGreetingPatterns(texts),

        // Style
        usesSlang: detectSlang(texts),
        formality: detectFormalityLevel(texts),
        humorPatterns: detectHumor(texts),

        // Response patterns
        responseTimeAvg: conversations.length > 0
            ? average(conversations.filter(c => c.replyDelay > 0).map(c => c.replyDelay))
            : 60000, // default 1 min

        // Vietnamese-specific
        pronounUsage: detectVietnamesePronouns(texts),
        toneDiacritics: checkDiacriticUsage(texts),
        abbreviations: detectAbbreviations(texts),

        // Primary language detection
        primaryLanguage: detectLanguage(texts),
    };
}

// ═══════════════════════════════════════════
// Helper functions
// ═══════════════════════════════════════════

function average(arr) {
    if (arr.length === 0) return 0;
    return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function countEmojis(texts) {
    let count = 0;
    for (const text of texts) {
        const matches = text.match(EMOJI_REGEX);
        if (matches) count += matches.length;
    }
    return count;
}

function getTopEmojis(texts, n) {
    const counts = {};
    for (const text of texts) {
        const matches = text.match(EMOJI_REGEX);
        if (matches) {
            for (const emoji of matches) {
                counts[emoji] = (counts[emoji] || 0) + 1;
            }
        }
    }
    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([emoji, count]) => ({ emoji, count }));
}

export function getTopWords(texts, n) {
    const stopWords = new Set([
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
        'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
        'before', 'after', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet',
        'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his',
        'she', 'her', 'it', 'its', 'they', 'them', 'their', 'this', 'that',
        'these', 'those', 'if', 'then', 'than', 'when', 'what', 'which',
        // Vietnamese stop words
        'là', 'và', 'của', 'có', 'được', 'cho', 'với', 'từ', 'trong',
        'các', 'này', 'đó', 'để', 'về', 'cũng', 'như', 'nhưng', 'hay',
        'thì', 'sẽ', 'đã', 'rồi', 'mà', 'vì', 'nếu',
    ]);

    const counts = {};
    for (const text of texts) {
        const words = text.toLowerCase().split(/\s+/);
        for (const word of words) {
            const clean = word.replace(/[^\p{L}\p{N}]/gu, '');
            if (clean.length > 1 && !stopWords.has(clean)) {
                counts[clean] = (counts[clean] || 0) + 1;
            }
        }
    }

    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([word, count]) => ({ word, count }));
}

export function getTopPhrases(texts, n) {
    const counts = {};
    for (const text of texts) {
        const words = text.toLowerCase().split(/\s+/);
        // Bigrams and trigrams
        for (let i = 0; i < words.length - 1; i++) {
            const bigram = `${words[i]} ${words[i + 1]}`;
            counts[bigram] = (counts[bigram] || 0) + 1;

            if (i < words.length - 2) {
                const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
                counts[trigram] = (counts[trigram] || 0) + 1;
            }
        }
    }

    return Object.entries(counts)
        .filter(([, count]) => count >= 2) // At least 2 occurrences
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([phrase, count]) => ({ phrase, count }));
}

export function detectCatchphrases(texts) {
    // Phrases that appear significantly more than average
    const phraseCounts = {};
    for (const text of texts) {
        const lower = text.toLowerCase().trim();
        // Exact full messages (short ones are often catchphrases)
        if (lower.length <= 30) {
            phraseCounts[lower] = (phraseCounts[lower] || 0) + 1;
        }
    }

    return Object.entries(phraseCounts)
        .filter(([, count]) => count >= 3)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([phrase]) => phrase);
}

function detectGreetingPatterns(texts) {
    const greetings = {
        casual: ['yo', 'ê', 'ey', 'hey', 'hi', 'hello bro', 'sup'],
        formal: ['xin chào', 'chào', 'hello', 'good morning', 'good evening'],
        slang: ['ê mày', 'ê bro', 'yoo', 'hellu', 'helu'],
    };

    const detected = [];
    for (const text of texts) {
        const lower = text.toLowerCase().trim();
        for (const [style, patterns] of Object.entries(greetings)) {
            if (patterns.some(p => lower.startsWith(p))) {
                detected.push(style);
                break;
            }
        }
    }

    if (detected.length === 0) return 'neutral';

    // Most common greeting style
    const counts = {};
    for (const style of detected) {
        counts[style] = (counts[style] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function detectSlang(texts) {
    const slangPatterns = [
        'vl', 'vcl', 'vkl', 'dm', 'đm', 'lol', 'lmao', 'bruh', 'bro',
        'ez', 'gg', 'wp', 'noob', 'ngl', 'tbh', 'fr', 'lowkey',
    ];

    let slangCount = 0;
    for (const text of texts) {
        const words = text.toLowerCase().split(/\s+/);
        for (const word of words) {
            if (slangPatterns.includes(word)) {
                slangCount++;
            }
        }
    }

    return slangCount / Math.max(texts.length, 1) > 0.05; // >5% of messages
}

function detectFormalityLevel(texts) {
    let formalCount = 0;
    let informalCount = 0;

    const formalPatterns = ['ạ', 'vâng', 'dạ', 'xin', 'kính', 'trân trọng'];
    const informalPatterns = ['mày', 'tao', 'nó', 'vl', 'đm', 'ez', 'oke', 'ok'];

    for (const text of texts) {
        const lower = text.toLowerCase();
        if (formalPatterns.some(p => lower.includes(p))) formalCount++;
        if (informalPatterns.some(p => lower.includes(p))) informalCount++;
    }

    if (formalCount > informalCount * 2) return 'formal';
    if (informalCount > formalCount * 2) return 'casual';
    return 'mixed';
}

function detectHumor(texts) {
    const patterns = [];

    // Check for laughing patterns
    const laughPatterns = ['😂', '🤣', 'haha', 'hihi', 'lol', 'lmao', '=))', ':))'];
    let laughCount = 0;
    for (const text of texts) {
        if (laughPatterns.some(p => text.toLowerCase().includes(p))) {
            laughCount++;
        }
    }
    if (laughCount / texts.length > 0.1) patterns.push('frequent-laughter');

    // Check for sarcasm indicators
    const sarcasmPatterns = ['🙄', 'sure...', 'totally', 'right...', 'okay then'];
    let sarcasmCount = 0;
    for (const text of texts) {
        if (sarcasmPatterns.some(p => text.toLowerCase().includes(p))) {
            sarcasmCount++;
        }
    }
    if (sarcasmCount > 3) patterns.push('sarcastic');

    return patterns.length > 0 ? patterns : ['neutral'];
}

function detectVietnamesePronouns(texts) {
    const pronouns = {
        'tao/mày': 0, 'tớ/cậu': 0, 'mình/bạn': 0,
        'anh/em': 0, 'chị/em': 0, 't/m': 0, 'con': 0,
    };

    for (const text of texts) {
        const lower = text.toLowerCase();
        const words = lower.split(/\s+/);

        for (const word of words) {
            if (word === 'tao' || word === 'mày') pronouns['tao/mày']++;
            else if (word === 'tớ' || word === 'cậu') pronouns['tớ/cậu']++;
            else if (word === 'mình' || word === 'bạn') pronouns['mình/bạn']++;
            else if (word === 'anh') pronouns['anh/em']++;
            else if (word === 'chị') pronouns['chị/em']++;
            else if (word === 't' || word === 'm') pronouns['t/m']++;
            else if (word === 'con') pronouns['con']++;
        }
    }

    // Return most used pronoun style
    const sorted = Object.entries(pronouns).sort((a, b) => b[1] - a[1]);
    return sorted.filter(([, count]) => count > 0).map(([pronoun]) => pronoun);
}

function checkDiacriticUsage(texts) {
    const vietnameseWithDiacritics = /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/i;

    let withCount = 0;
    for (const text of texts) {
        if (vietnameseWithDiacritics.test(text)) withCount++;
    }

    return withCount / Math.max(texts.length, 1) > 0.3; // >30% uses diacritics
}

export function detectAbbreviations(texts) {
    const commonAbbrs = {
        'k': 0, 'ko': 0, 'dc': 0, 'nc': 0, 'ntn': 0, 'bn': 0,
        'gì': 0, 'đc': 0, 'mk': 0, 'r': 0, 'cx': 0, 'vs': 0,
        'oke': 0, 'ok': 0, 'tks': 0, 'thankiu': 0, 'thx': 0,
        'btw': 0, 'omg': 0, 'wtf': 0, 'idk': 0, 'imo': 0,
    };

    for (const text of texts) {
        const words = text.toLowerCase().split(/\s+/);
        for (const word of words) {
            if (word in commonAbbrs) {
                commonAbbrs[word]++;
            }
        }
    }

    return Object.entries(commonAbbrs)
        .filter(([, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .map(([abbr]) => abbr);
}

function detectLanguage(texts) {
    let vnCount = 0;
    let enCount = 0;
    const vnPattern = /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/i;
    const vnSlangPattern = /\b(k[oô]ng?|vl|đm|ck|cmn|vcl|ntn|bt|bn)\b/i;

    for (const text of texts) {
        if (vnPattern.test(text) || vnSlangPattern.test(text)) vnCount++;
        else enCount++;
    }

    const total = vnCount + enCount || 1;
    const vnPercent = Math.round((vnCount / total) * 100);
    const enPercent = Math.round((enCount / total) * 100);

    // Detect mixed usage (both > 20%)
    if (vnPercent > 20 && enPercent > 20) {
        return `Mixed (Vietnamese ${vnPercent}% / English ${enPercent}%)`;
    }
    if (vnCount > enCount) return 'Vietnamese';
    if (enCount > vnCount) return 'English';
    return 'Mixed';
}
