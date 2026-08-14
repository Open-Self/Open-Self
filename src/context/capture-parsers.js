import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';

export function parseCalendarSource(sourcePath, options) {
    return sourceFiles(sourcePath, new Set(['.ics'])).flatMap((file) => {
        const content = readFileSync(file, 'utf8').replace(/\r?\n[ \t]/g, '');
        const events = [...content.matchAll(/BEGIN:VEVENT\r?\n([\s\S]*?)\r?\nEND:VEVENT/g)];
        return events.slice(0, options.limit).map((match, index) => {
            const properties = parseProperties(match[1]);
            const summary = unescapeIcs(first(properties, 'SUMMARY') || 'Untitled event');
            const start = parseIcsDate(first(properties, 'DTSTART'));
            const end = parseIcsDate(first(properties, 'DTEND'));
            const location = unescapeIcs(first(properties, 'LOCATION') || '');
            const description = unescapeIcs(first(properties, 'DESCRIPTION') || '');
            const uid = first(properties, 'UID') || fingerprint(file, index, summary, start);
            const recurrence = first(properties, 'RECURRENCE-ID') || '';
            return {
                key: `${uid}:${recurrence}`,
                memory: {
                    type: 'event',
                    content: compact([
                        summary,
                        location && `Location: ${location}`,
                        end && `Ends: ${end}`,
                        description,
                    ])
                        .join('\n')
                        .slice(0, 20_000),
                    summary,
                    source: { kind: 'calendar', locator: file, title: basename(file) },
                    scope: options.scope,
                    sensitivity: options.sensitivity,
                    confidence: 1,
                    occurredAt: start,
                    tags: ['calendar'],
                },
            };
        });
    });
}

export function parseEmailSource(sourcePath, options) {
    const files = sourceFiles(sourcePath, new Set(['.eml', '.mbox', '.mbx']));
    const records = [];
    for (const file of files) {
        const raw = readFileSync(file, 'utf8');
        const messages = /\.mb(?:ox|x)$/i.test(file) ? splitMbox(raw) : [raw];
        for (let index = 0; index < messages.length && records.length < options.limit; index++) {
            const message = parseEmail(messages[index]);
            if (!message.body && !message.subject) continue;
            const occurredAt = parseIsoDate(message.date);
            const key =
                message.messageId ||
                fingerprint(file, index, message.subject, message.from, message.date, message.body);
            records.push({
                key,
                memory: {
                    type: 'event',
                    content: compact([
                        message.subject && `Subject: ${message.subject}`,
                        message.from && `From: ${message.from}`,
                        message.to && `To: ${message.to}`,
                        message.body,
                    ])
                        .join('\n')
                        .slice(0, 20_000),
                    summary: message.subject || 'Email message',
                    source: { kind: 'email', locator: file, title: basename(file) },
                    scope: options.scope,
                    sensitivity: options.sensitivity,
                    confidence: 1,
                    occurredAt,
                    tags: ['email'],
                },
            });
        }
    }
    return records;
}

export function parseBrowserSource(sourcePath, options) {
    const extension = extname(sourcePath).toLowerCase();
    let entries;
    if (extension === '.html' || extension === '.htm') entries = parseBookmarkHtml(sourcePath);
    else if (extension === '.json') entries = parseBrowserJson(sourcePath);
    else entries = parseBrowserDatabase(sourcePath, options.limit);

    return entries
        .filter((entry) => entry.url)
        .sort((left, right) => String(right.occurredAt || '').localeCompare(left.occurredAt || ''))
        .slice(0, options.limit)
        .map((entry) => ({
            key: `${entry.kind}:${entry.url}`,
            memory: {
                type: entry.kind === 'history' ? 'event' : 'note',
                content: `${entry.title || 'Untitled page'}\nURL: ${entry.url}`,
                summary: entry.title || entry.url,
                source: {
                    kind: `browser-${entry.kind}`,
                    locator: sourcePath,
                    title: basename(sourcePath),
                },
                scope: options.scope,
                sensitivity: options.sensitivity,
                confidence: 1,
                occurredAt: entry.occurredAt,
                tags: ['browser', entry.kind],
            },
        }));
}

function sourceFiles(sourcePath, extensions) {
    const absolute = resolve(sourcePath);
    if (statSync(absolute).isFile()) {
        if (!extensions.has(extname(absolute).toLowerCase())) {
            throw new Error(`Unsupported capture file: ${absolute}`);
        }
        return [absolute];
    }
    const files = [];
    const visit = (directory) => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            if (entry.isSymbolicLink()) continue;
            const path = join(directory, entry.name);
            if (entry.isDirectory()) visit(path);
            else if (entry.isFile() && extensions.has(extname(entry.name).toLowerCase()))
                files.push(path);
        }
    };
    visit(absolute);
    return files.sort((left, right) =>
        relative(absolute, left).localeCompare(relative(absolute, right)),
    );
}

function parseProperties(block) {
    const properties = new Map();
    for (const line of block.split(/\r?\n/)) {
        const separator = line.indexOf(':');
        if (separator < 1) continue;
        const name = line.slice(0, separator).split(';')[0].toUpperCase();
        const values = properties.get(name) || [];
        values.push(line.slice(separator + 1));
        properties.set(name, values);
    }
    return properties;
}

function first(properties, name) {
    return properties.get(name)?.[0];
}

function parseIcsDate(value) {
    if (!value) return undefined;
    const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?Z?)?$/);
    if (!match) return undefined;
    return new Date(
        Date.UTC(
            Number(match[1]),
            Number(match[2]) - 1,
            Number(match[3]),
            Number(match[4] || 0),
            Number(match[5] || 0),
            Number(match[6] || 0),
        ),
    ).toISOString();
}

function unescapeIcs(value) {
    return String(value || '')
        .replace(/\\n/gi, '\n')
        .replace(/\\([,;\\])/g, '$1')
        .trim();
}

function splitMbox(raw) {
    return raw
        .split(/\r?\n(?=From [^\r\n]+\r?\n)/)
        .map((message) => message.replace(/^From [^\r\n]+\r?\n/, ''))
        .filter((message) => message.trim());
}

function parseEmail(raw) {
    const separator = raw.search(/\r?\n\r?\n/);
    const headerText = separator >= 0 ? raw.slice(0, separator) : raw;
    const bodyText = separator >= 0 ? raw.slice(separator).replace(/^\r?\n\r?\n/, '') : '';
    const headers = new Map();
    for (const line of headerText.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
        const index = line.indexOf(':');
        if (index < 1) continue;
        headers.set(line.slice(0, index).toLowerCase(), line.slice(index + 1).trim());
    }
    const contentType = headers.get('content-type') || 'text/plain';
    const transferEncoding = headers.get('content-transfer-encoding') || '';
    return {
        messageId: (headers.get('message-id') || '').replace(/[<>]/g, ''),
        subject: decodeHeader(headers.get('subject') || ''),
        from: decodeHeader(headers.get('from') || ''),
        to: decodeHeader(headers.get('to') || ''),
        date: headers.get('date') || '',
        body: extractEmailBody(bodyText, contentType, transferEncoding),
    };
}

function extractEmailBody(body, contentType, transferEncoding) {
    const boundary = contentType
        .match(/boundary=(?:"([^"]+)"|([^;\s]+))/i)
        ?.slice(1)
        .find(Boolean);
    if (boundary) {
        const parts = body.split(`--${boundary}`);
        const plain = parts.find((part) => /content-type:\s*text\/plain/i.test(part));
        const html = parts.find((part) => /content-type:\s*text\/html/i.test(part));
        if (plain || html) {
            const parsed = parseEmail(plain || html);
            return parsed.body;
        }
    }
    let decoded = decodeTransfer(body, transferEncoding);
    if (/text\/html/i.test(contentType)) decoded = stripHtml(decoded);
    return decoded.replace(/\r\n/g, '\n').trim().slice(0, 16_000);
}

function decodeTransfer(value, encoding) {
    if (/base64/i.test(encoding)) {
        try {
            return Buffer.from(value.replace(/\s/g, ''), 'base64').toString('utf8');
        } catch {
            return value;
        }
    }
    if (/quoted-printable/i.test(encoding)) return decodeQuotedPrintable(value);
    return value;
}

function decodeHeader(value) {
    return value.replace(/=\?([^?]+)\?([bq])\?([^?]+)\?=/gi, (_match, _charset, mode, data) => {
        try {
            return mode.toLowerCase() === 'b'
                ? Buffer.from(data, 'base64').toString('utf8')
                : decodeQuotedPrintable(data.replaceAll('_', ' '));
        } catch {
            return data;
        }
    });
}

function decodeQuotedPrintable(value) {
    const unfolded = value.replace(/=\r?\n/g, '');
    const bytes = [];
    for (let index = 0; index < unfolded.length; index++) {
        const hex = unfolded.slice(index + 1, index + 3);
        if (unfolded[index] === '=' && /^[0-9a-f]{2}$/i.test(hex)) {
            bytes.push(Number.parseInt(hex, 16));
            index += 2;
        } else {
            bytes.push(...Buffer.from(unfolded[index]));
        }
    }
    return Buffer.from(bytes).toString('utf8');
}

function stripHtml(value) {
    return decodeHtml(
        value
            .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
            .replace(/<br\s*\/?\s*>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<[^>]+>/g, ' '),
    )
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s+/g, '\n')
        .trim();
}

function parseBookmarkHtml(path) {
    const html = readFileSync(path, 'utf8');
    return [...html.matchAll(/<A\b([^>]*)>([\s\S]*?)<\/A>/gi)].map((match) => {
        const url = sanitizeUrl(attribute(match[1], 'HREF'));
        const added = Number(attribute(match[1], 'ADD_DATE'));
        return {
            kind: 'bookmark',
            url,
            title: decodeHtml(stripHtml(match[2])),
            occurredAt:
                Number.isFinite(added) && added > 0
                    ? new Date(added * 1_000).toISOString()
                    : undefined,
        };
    });
}

function parseBrowserJson(path) {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    const entries = [];
    const visit = (value) => {
        if (Array.isArray(value)) {
            value.forEach(visit);
            return;
        }
        if (!value || typeof value !== 'object') return;
        if (typeof value.url === 'string') {
            entries.push({
                kind: value.type === 'url' || value.date_added ? 'bookmark' : 'history',
                url: sanitizeUrl(value.url),
                title: String(value.name || value.title || ''),
                occurredAt: browserJsonDate(value),
            });
        }
        Object.values(value).forEach(visit);
    };
    visit(data);
    return entries;
}

function parseBrowserDatabase(path, limit) {
    const db = new Database(path, { readonly: true, fileMustExist: true });
    try {
        const tables = new Set(
            db
                .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
                .all()
                .map((row) => row.name),
        );
        if (tables.has('urls')) {
            return db
                .prepare(
                    `SELECT url, title, last_visit_time, visit_count FROM urls
                     WHERE last_visit_time > 0 ORDER BY last_visit_time DESC LIMIT ?`,
                )
                .all(limit)
                .map((row) => ({
                    kind: 'history',
                    url: sanitizeUrl(row.url),
                    title: row.title || '',
                    occurredAt: chromiumDate(row.last_visit_time),
                }));
        }
        if (tables.has('moz_places')) {
            return db
                .prepare(
                    `SELECT url, title, last_visit_date, visit_count FROM moz_places
                     WHERE last_visit_date IS NOT NULL ORDER BY last_visit_date DESC LIMIT ?`,
                )
                .all(limit)
                .map((row) => ({
                    kind: 'history',
                    url: sanitizeUrl(row.url),
                    title: row.title || '',
                    occurredAt: new Date(Number(row.last_visit_date) / 1_000).toISOString(),
                }));
        }
        throw new Error(
            'Unsupported browser database: expected Chromium urls or Firefox moz_places',
        );
    } finally {
        db.close();
    }
}

function browserJsonDate(value) {
    const raw = value.last_visit_time || value.time_usec || value.date_added || value.visitTime;
    if (!raw) return undefined;
    const number = Number(raw);
    if (!Number.isFinite(number)) return parseIsoDate(raw);
    if (number > 10_000_000_000_000_000) return chromiumDate(number);
    if (number > 10_000_000_000_000) return new Date(number / 1_000).toISOString();
    if (number > 10_000_000_000) return new Date(number).toISOString();
    return new Date(number * 1_000).toISOString();
}

function chromiumDate(value) {
    return new Date(Number(value) / 1_000 - 11_644_473_600_000).toISOString();
}

function sanitizeUrl(value) {
    try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol)) return '';
        url.username = '';
        url.password = '';
        url.search = '';
        url.hash = '';
        return url.toString();
    } catch {
        return '';
    }
}

function attribute(text, name) {
    return (
        text
            .match(new RegExp(`${name}=(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
            ?.slice(1)
            .find(Boolean) || ''
    );
}

function decodeHtml(value) {
    return String(value || '')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)));
}

function parseIsoDate(value) {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function compact(values) {
    return values.map((value) => String(value || '').trim()).filter(Boolean);
}

function fingerprint(...values) {
    return createHash('sha256').update(values.join('\u001f')).digest('hex');
}
