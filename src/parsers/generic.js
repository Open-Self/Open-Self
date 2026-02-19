import { readFileSync } from 'fs';

/**
 * Parse generic text / manual personality brief
 * Freeform text describing the user's personality
 */

export function parseGeneric(filePath) {
    const content = readFileSync(filePath, 'utf-8');
    return parseGenericContent(content);
}

export function parseGenericContent(content) {
    const lines = content.split('\n').filter(l => l.trim());

    return {
        type: 'manual',
        rawContent: content,
        sections: extractSections(lines),
    };
}

/**
 * Try to extract structured sections from freeform text
 */
function extractSections(lines) {
    const sections = {};
    let currentSection = 'general';
    const sectionPattern = /^#+\s+(.+)|^([A-Za-z\s]+):\s*$/;

    for (const line of lines) {
        const match = line.match(sectionPattern);
        if (match) {
            currentSection = (match[1] || match[2]).toLowerCase().trim();
            sections[currentSection] = [];
        } else {
            if (!sections[currentSection]) sections[currentSection] = [];
            sections[currentSection].push(line.trim());
        }
    }

    return sections;
}
