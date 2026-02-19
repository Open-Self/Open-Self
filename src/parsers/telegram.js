import { readFileSync } from 'fs';

/**
 * Parse Telegram Desktop JSON export (result.json)
 * Telegram export format: { messages: [{ from, date, text, ... }] }
 */

export function parseTelegram(filePath) {
    const content = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);

    // Handle both direct chat export and full data export
    const rawMessages = data.messages || data.chats?.list?.[0]?.messages || [];

    const messages = [];

    for (const msg of rawMessages) {
        // Skip non-text messages
        if (msg.type !== 'message') continue;

        // Handle text that can be string or array of text entities
        let text = '';
        if (typeof msg.text === 'string') {
            text = msg.text;
        } else if (Array.isArray(msg.text)) {
            text = msg.text
                .map(part => (typeof part === 'string' ? part : part.text || ''))
                .join('');
        }

        if (!text.trim()) continue;

        // Parse date
        const dateObj = new Date(msg.date);
        const date = dateObj.toLocaleDateString('en-GB'); // DD/MM/YYYY
        const time = dateObj.toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
        });

        messages.push({
            date,
            time,
            sender: msg.from || msg.from_id || 'Unknown',
            text: text.trim(),
        });
    }

    return messages;
}

/**
 * Split messages by sender (reuse logic from whatsapp parser)
 */
export { splitBySender, groupIntoConversations, detectUserName } from './whatsapp.js';
