import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { parseTelegram } from '../parsers/telegram.js';
import { parseWhatsApp } from '../parsers/whatsapp.js';

const WHATSAPP_HEADER = /^\d{1,2}\/\d{1,2}\/\d{2,4},?\s\d{1,2}:\d{2}\s-\s[^:]+:\s/m;

export class ContextImporter {
    constructor(store) {
        this.store = store;
    }

    importFile(filePath, options = {}) {
        const absolutePath = resolve(filePath);
        const format =
            options.format && options.format !== 'auto'
                ? options.format
                : detectImportFormat(absolutePath);
        const candidates = buildCandidates(absolutePath, format, options);
        const report = {
            format,
            source: absolutePath,
            discovered: candidates.length,
            created: 0,
            duplicates: 0,
            skipped: 0,
            dryRun: Boolean(options.dryRun),
            errors: [],
        };

        if (options.dryRun) return report;

        for (const candidate of candidates) {
            try {
                const result = this.store.rememberOnce(candidate.memory, candidate.dedupeKey);
                if (result.created) report.created++;
                else report.duplicates++;
            } catch (error) {
                report.skipped++;
                report.errors.push(error.message);
            }
        }

        return report;
    }
}

export function detectImportFormat(filePath) {
    const extension = extname(filePath).toLowerCase();
    if (extension === '.md' || extension === '.mdx') return 'markdown';
    if (extension === '.json') return 'telegram';
    if (extension === '.txt') {
        const sample = readFileSync(filePath, 'utf8').slice(0, 8_000);
        return WHATSAPP_HEADER.test(sample) ? 'whatsapp' : 'text';
    }
    return 'text';
}

function buildCandidates(filePath, format, options) {
    switch (format) {
        case 'markdown':
        case 'text':
            return buildDocumentCandidates(filePath, format, options);
        case 'whatsapp':
            return buildChatCandidates(parseWhatsApp(filePath), filePath, format, options);
        case 'telegram':
            return buildChatCandidates(parseTelegram(filePath), filePath, format, options);
        default:
            throw new Error(
                `Unsupported import format: ${format}. Use auto, markdown, text, whatsapp, or telegram.`,
            );
    }
}

function buildDocumentCandidates(filePath, format, options) {
    const content = readFileSync(filePath, 'utf8');
    const chunks = chunkDocument(content, options.maxChunkChars || 2_000);
    const title = basename(filePath);
    const scope = options.scope || `document/${slug(title.replace(/\.[^.]+$/, ''))}`;
    const sensitivity = options.sensitivity || 'personal';

    return chunks.map((chunk, index) => {
        const memory = {
            type: options.type || 'note',
            content: chunk.content,
            summary: chunk.heading || `${title} · part ${index + 1}`,
            source: { kind: format, locator: filePath, title },
            scope,
            sensitivity,
            confidence: options.confidence ?? 1,
            tags: unique([
                format,
                ...(options.tags || []),
                ...(chunk.heading ? [chunk.heading] : []),
            ]),
        };
        return {
            memory,
            dedupeKey: fingerprint(format, filePath, chunk.heading, chunk.content),
        };
    });
}

function buildChatCandidates(messages, filePath, format, options) {
    const title = basename(filePath);
    const scope = options.scope || `conversation/${format}/${slug(title.replace(/\.[^.]+$/, ''))}`;
    const sensitivity = options.sensitivity || 'private';

    return messages.map((message) => {
        const occurredAt = message.timestamp || chatDateToIso(message.date, message.time);
        const memory = {
            type: options.type || 'event',
            content: `${message.sender}: ${message.text}`,
            summary: `${message.sender} message`,
            source: { kind: format, locator: filePath, title },
            scope,
            sensitivity,
            confidence: options.confidence ?? 1,
            occurredAt,
            tags: unique([format, `sender-${slug(message.sender)}`, ...(options.tags || [])]),
        };
        return {
            memory,
            dedupeKey: fingerprint(format, filePath, message.sender, occurredAt, message.text),
        };
    });
}

export function chunkDocument(content, maxChars = 2_000) {
    const normalized = String(content || '')
        .replace(/\r\n/g, '\n')
        .trim();
    if (!normalized) return [];

    const chunks = [];
    let heading = '';
    let buffer = '';

    const flush = () => {
        if (!buffer.trim()) return;
        for (const part of splitLongText(buffer.trim(), maxChars)) {
            chunks.push({ heading, content: part });
        }
        buffer = '';
    };

    for (const line of normalized.split('\n')) {
        const headingMatch = line.trim().match(/^#{1,6}\s+(.+)$/);
        if (headingMatch) {
            flush();
            heading = headingMatch[1].trim();
            continue;
        }
        buffer = buffer ? `${buffer}\n${line}` : line;
    }
    flush();
    return chunks;
}

function splitLongText(text, maxChars) {
    const parts = [];
    let remaining = text;
    while (remaining.length > maxChars) {
        let boundary = remaining.lastIndexOf(' ', maxChars);
        if (boundary < Math.floor(maxChars * 0.5)) boundary = maxChars;
        parts.push(remaining.slice(0, boundary).trim());
        remaining = remaining.slice(boundary).trim();
    }
    if (remaining) parts.push(remaining);
    return parts;
}

function chatDateToIso(date, time) {
    const match = String(date || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    const timeMatch = String(time || '').match(/^(\d{1,2}):(\d{2})/);
    if (!match || !timeMatch) return undefined;
    let year = Number(match[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    return new Date(
        Date.UTC(
            year,
            Number(match[2]) - 1,
            Number(match[1]),
            Number(timeMatch[1]),
            Number(timeMatch[2]),
        ),
    ).toISOString();
}

function fingerprint(...parts) {
    return createHash('sha256')
        .update(parts.map((part) => String(part || '')).join('\u001f'))
        .digest('hex');
}

function slug(value) {
    return (
        String(value || 'unknown')
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 80) || 'unknown'
    );
}

function unique(values) {
    return [...new Set(values.map((value) => String(value).trim().toLowerCase()).filter(Boolean))];
}
