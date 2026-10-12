/**
 * Language registry + detection — multi-language support (EN/VI/ES/FR/DE/PT)
 */
import { describe, it, expect } from 'vitest';
import { detectLanguage } from '../../../src/lang/detect.js';
import {
    getLanguage,
    isFormal,
    LANGUAGES,
    ALL_STOPWORDS,
    ALL_AI_REVEAL_PATTERNS,
} from '../../../src/lang/languages.js';

// Representative multi-message samples — real feed input is many messages, so a
// handful per language gives detection enough signal to be decisive.
const SAMPLES = {
    English: [
        'hey what are you doing tonight',
        'just chilling with the guys',
        'yeah that sounds good to me',
        'no worries man see you then',
        'lol that was hilarious honestly',
    ],
    Vietnamese: [
        'ê mai đi cà phê không',
        'ừ được đó mấy giờ',
        'trưa đi cho mát nha',
        'ok chốt vậy đi bro',
        'đm nay nóng vãi',
    ],
    Spanish: [
        'hola qué haces esta noche',
        'nada aquí con los amigos',
        'vale nos vemos luego entonces',
        'jaja qué gracioso tío',
        'oye me pasas el número',
    ],
    French: [
        'salut qu est-ce que tu fais ce soir',
        'rien je traîne avec les copains',
        'ok on se voit tout à l heure',
        'ah ça marche pour moi',
        'tu peux m envoyer le lien',
    ],
    German: [
        'hey was machst du heute abend',
        'nichts ich bin mit den jungs unterwegs',
        'ja das klingt gut für mich',
        'kein problem bis später dann',
        'das war echt lustig ehrlich',
    ],
    Portuguese: [
        'oi o que você está fazendo hoje',
        'nada aqui com os amigos',
        'beleza a gente se vê depois',
        'kkk que engraçado cara',
        'me manda o número aí',
    ],
};

describe('detectLanguage', () => {
    for (const [lang, texts] of Object.entries(SAMPLES)) {
        it(`detects ${lang} from representative messages`, () => {
            expect(detectLanguage(texts)).toBe(lang);
        });
    }

    it('returns Unknown for no input', () => {
        expect(detectLanguage([])).toBe('Unknown');
    });

    it('labels heavily bilingual input as Mixed', () => {
        const mixed = detectLanguage([
            'ê mai đi cà phê không',
            'ừ được đó',
            'hey what are you doing tonight',
            'just chilling honestly',
        ]);
        expect(mixed).toMatch(/^Mixed \(/);
    });
});

describe('getLanguage', () => {
    it('returns the entry for a known language', () => {
        expect(getLanguage('Spanish').name).toBe('Spanish');
    });

    it('falls back to English for unknown or mixed labels', () => {
        expect(getLanguage('Klingon').name).toBe('English');
        expect(getLanguage('Mixed (Vietnamese 60% / English 40%)').name).toBe('English');
    });

    it('every language provides unsure/busy/deflect fallbacks', () => {
        for (const l of LANGUAGES) {
            expect(l.fallback.unsure).toBeTruthy();
            expect(l.fallback.busy).toBeTruthy();
            expect(l.fallback.deflect).toBeTruthy();
        }
    });
});

describe('isFormal', () => {
    it('flags formal registers across languages', () => {
        expect(isFormal('would you please help')).toBe(true); // English
        expect(isFormal('cómo está usted')).toBe(true); // Spanish
        expect(isFormal('können Sie mir helfen')).toBe(true); // German
    });

    it('does not flag casual text', () => {
        expect(isFormal('yo dude sup lol')).toBe(false);
    });
});

describe('aggregated language data', () => {
    it('ALL_STOPWORDS unions every language (EN + VI + ES + DE)', () => {
        expect(ALL_STOPWORDS.has('the')).toBe(true);
        expect(ALL_STOPWORDS.has('của')).toBe(true);
        expect(ALL_STOPWORDS.has('para')).toBe(true);
        expect(ALL_STOPWORDS.has('nicht')).toBe(true);
    });

    it('ALL_AI_REVEAL_PATTERNS catches self-reveals in any language', () => {
        const hit = (t) => ALL_AI_REVEAL_PATTERNS.some((p) => p.test(t));
        expect(hit('je suis une IA')).toBe(true); // French
        expect(hit('ich bin eine KI')).toBe(true); // German
        expect(hit('sou uma inteligência artificial')).toBe(true); // Portuguese
        expect(hit('tôi là AI')).toBe(true); // Vietnamese
    });
});
