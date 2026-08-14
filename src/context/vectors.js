const CONCEPT_ALIASES = new Map([
    ['db', 'database'],
    ['database', 'database'],
    ['postgres', 'database'],
    ['postgresql', 'database'],
    ['sqlite', 'database'],
    ['mysql', 'database'],
    ['price', 'pricing'],
    ['prices', 'pricing'],
    ['pricing', 'pricing'],
    ['cost', 'pricing'],
    ['meeting', 'meeting'],
    ['meet', 'meeting'],
    ['call', 'meeting'],
    ['decision', 'decision'],
    ['decide', 'decision'],
    ['decided', 'decision'],
    ['choose', 'decision'],
    ['chosen', 'decision'],
    ['chon', 'decision'],
    ['quyet', 'decision'],
    ['preference', 'preference'],
    ['prefer', 'preference'],
    ['preferred', 'preference'],
    ['thich', 'preference'],
    ['deadline', 'deadline'],
    ['due', 'deadline'],
    ['han', 'deadline'],
]);

export class LocalVectorEncoder {
    constructor(options = {}) {
        this.dimensions = options.dimensions || 256;
        this.model = `openself-feature-hash-v1-${this.dimensions}`;
    }

    encode(text) {
        const tokens = tokenize(text);
        const vector = new Array(this.dimensions).fill(0);

        for (let index = 0; index < tokens.length; index++) {
            addFeature(vector, `word:${tokens[index]}`, 1);
            const concept = CONCEPT_ALIASES.get(tokens[index]);
            if (concept) addFeature(vector, `concept:${concept}`, 1.4);
            if (index > 0) addFeature(vector, `bigram:${tokens[index - 1]}_${tokens[index]}`, 0.7);

            if (tokens[index].length >= 4) {
                const padded = `^${tokens[index]}$`;
                for (let offset = 0; offset <= padded.length - 3; offset++) {
                    addFeature(vector, `char:${padded.slice(offset, offset + 3)}`, 0.2);
                }
            }
        }

        const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
        return norm ? vector.map((value) => value / norm) : vector;
    }
}

export function cosineSimilarity(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return 0;
    let dot = 0;
    let leftNorm = 0;
    let rightNorm = 0;
    for (let index = 0; index < left.length; index++) {
        dot += left[index] * right[index];
        leftNorm += left[index] * left[index];
        rightNorm += right[index] * right[index];
    }
    const denominator = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
    return denominator ? dot / denominator : 0;
}

function tokenize(text) {
    return (
        String(text || '')
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .match(/[\p{L}\p{N}]+/gu) || []
    ).slice(0, 500);
}

function addFeature(vector, feature, weight) {
    const hash = hashFeature(feature);
    const index = (hash >>> 1) % vector.length;
    vector[index] += hash & 1 ? weight : -weight;
}

function hashFeature(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}
