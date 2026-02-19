import { existsSync } from 'fs';
import { parseWhatsApp, splitBySender, detectUserName } from './whatsapp.js';
import { parseTelegram } from './telegram.js';
import { parseGeneric } from './generic.js';

/**
 * Auto-detect format and parse chat export
 */
export function parseFile(filePath, options = {}) {
    if (!existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    const format = options.format || detectFormat(filePath);

    switch (format) {
        case 'whatsapp':
            return {
                format: 'whatsapp',
                messages: parseWhatsApp(filePath),
            };
        case 'telegram':
            return {
                format: 'telegram',
                messages: parseTelegram(filePath),
            };
        case 'manual':
            return {
                format: 'manual',
                personality: parseGeneric(filePath),
            };
        default:
            throw new Error(`Unknown format: ${format}. Use --whatsapp, --telegram, or --manual`);
    }
}

/**
 * Auto-detect file format
 */
function detectFormat(filePath) {
    const lower = filePath.toLowerCase();

    if (lower.endsWith('.txt')) {
        return 'whatsapp'; // Most common .txt export
    }
    if (lower.endsWith('.json')) {
        return 'telegram';
    }
    if (lower.endsWith('.md')) {
        return 'manual';
    }

    return 'whatsapp'; // Default fallback
}

export {
    parseWhatsApp,
    parseTelegram,
    parseGeneric,
    splitBySender,
    detectUserName,
};
