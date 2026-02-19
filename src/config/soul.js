/**
 * SOUL.md Reader/Writer
 * Utilities for reading and writing SOUL.md personality files
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

/**
 * Read SOUL.md from data directory
 */
export function readSoul(dataDir = './data') {
    const filePath = join(dataDir, 'SOUL.md');

    if (!existsSync(filePath)) {
        return null;
    }

    return readFileSync(filePath, 'utf-8');
}

/**
 * Write SOUL.md to data directory
 */
export function writeSoul(content, dataDir = './data') {
    if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
    }

    const filePath = join(dataDir, 'SOUL.md');
    writeFileSync(filePath, content, 'utf-8');
    return filePath;
}

/**
 * Parse SOUL.md into structured sections
 */
export function parseSoul(content) {
    const sections = {};
    let currentSection = 'header';

    for (const line of content.split('\n')) {
        const headerMatch = line.match(/^##\s+(.+)/);
        if (headerMatch) {
            currentSection = headerMatch[1].trim().toLowerCase();
            sections[currentSection] = [];
            continue;
        }

        if (!sections[currentSection]) sections[currentSection] = [];

        const itemMatch = line.match(/^-\s+(.+?):\s+(.+)/);
        if (itemMatch) {
            sections[currentSection].push({
                key: itemMatch[1].trim(),
                value: itemMatch[2].trim(),
            });
        }
    }

    return sections;
}

/**
 * Check if SOUL.md exists
 */
export function soulExists(dataDir = './data') {
    return existsSync(join(dataDir, 'SOUL.md'));
}
