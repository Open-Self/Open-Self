import { readFileSync } from 'fs';

/**
 * Parse WhatsApp chat export (.txt) files
 * Format: "DD/MM/YYYY, HH:MM - Name: Message"
 */

const WHATSAPP_PATTERN = /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s(\d{1,2}:\d{2})\s-\s([^:]+):\s(.+)/;
const SYSTEM_PATTERN = /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s(\d{1,2}:\d{2})\s-\s(.+)/;

export function parseWhatsApp(filePath) {
    const content = readFileSync(filePath, 'utf-8');
    return parseWhatsAppContent(content);
}

export function parseWhatsAppContent(content) {
    const lines = content.split('\n');
    const messages = [];
    let currentMessage = null;

    for (const line of lines) {
        const match = line.match(WHATSAPP_PATTERN);
        if (match) {
            // Save previous message
            if (currentMessage) {
                messages.push(currentMessage);
            }
            currentMessage = {
                date: match[1],
                time: match[2],
                sender: match[3].trim(),
                text: match[4].trim(),
            };
        } else if (SYSTEM_PATTERN.test(line) && !WHATSAPP_PATTERN.test(line)) {
            // System message (e.g., "Messages are end-to-end encrypted")
            if (currentMessage) {
                messages.push(currentMessage);
                currentMessage = null;
            }
        } else if (currentMessage && line.trim()) {
            // Multi-line message continuation
            currentMessage.text += '\n' + line.trim();
        }
    }

    // Push last message
    if (currentMessage) {
        messages.push(currentMessage);
    }

    // Filter out media-only messages
    return messages.filter(m => !m.text.includes('<Media omitted>'));
}

/**
 * Split messages by sender: YOUR messages vs OTHERS
 */
export function splitBySender(messages, yourName) {
    const yours = messages.filter(m => m.sender === yourName);
    const others = messages.filter(m => m.sender !== yourName);
    const conversations = groupIntoConversations(messages, yourName);

    return { yours, others, conversations };
}

/**
 * Group messages into Q&A conversation pairs
 * Each pair: someone asks → you reply
 */
export function groupIntoConversations(messages, yourName) {
    const conversations = [];
    let pendingQuestion = null;

    for (const msg of messages) {
        if (msg.sender !== yourName) {
            // Someone else's message — potential question
            pendingQuestion = msg;
        } else if (pendingQuestion) {
            // Your reply to their message
            conversations.push({
                contact: pendingQuestion.sender,
                date: pendingQuestion.date,
                time: pendingQuestion.time,
                theirMessage: pendingQuestion.text,
                yourReply: msg.text,
                replyDelay: calculateDelay(pendingQuestion.time, msg.time),
            });
            pendingQuestion = null;
        }
    }

    return conversations;
}

/**
 * Detect the user's name from messages (most frequent sender, or manual)
 */
export function detectUserName(messages) {
    const senderCounts = {};
    for (const msg of messages) {
        senderCounts[msg.sender] = (senderCounts[msg.sender] || 0) + 1;
    }

    // Sort by frequency — the most frequent sender is likely the user
    const sorted = Object.entries(senderCounts).sort((a, b) => b[1] - a[1]);
    return {
        likelyUser: sorted[0]?.[0] || 'Unknown',
        allSenders: sorted.map(([name, count]) => ({ name, count })),
    };
}

function calculateDelay(time1, time2) {
    const [h1, m1] = time1.split(':').map(Number);
    const [h2, m2] = time2.split(':').map(Number);
    return ((h2 * 60 + m2) - (h1 * 60 + m1)) * 60 * 1000; // ms
}
