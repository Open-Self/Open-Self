/**
 * Lightweight secret detection for context leaving the vault (exports,
 * review surfaces). Pattern-based — a seatbelt, not a scanner like gitleaks;
 * the goal is to catch obviously-shaped credentials before plaintext export.
 */

const SECRET_PATTERNS = [
    { kind: 'aws-access-key', re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g },
    { kind: 'github-token', re: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{16,}\b/g },
    { kind: 'openai-key', re: /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}\b/g },
    { kind: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
    { kind: 'slack-webhook', re: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+/g },
    { kind: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
    {
        kind: 'jwt',
        re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    },
    { kind: 'private-key-block', re: /-----BEGIN [A-Z ]*PRIVATE KEY(?: BLOCK)?-----/g },
    {
        kind: 'credential-assignment',
        re: /\b(?:password|passwd|api[_-]?key|secret|access[_-]?token|auth[_-]?token)\b\s*[:=]\s*['"][^\s'"]{8,}['"]?/gi,
    },
];

/**
 * Scan text for secret-shaped strings. Returns findings as
 * `{ kind, index, match }` with `match` masked to the first 6 characters.
 */
export function scanForSecrets(text) {
    const findings = [];
    if (!text) return findings;
    for (const { kind, re } of SECRET_PATTERNS) {
        re.lastIndex = 0;
        for (const match of String(text).matchAll(re)) {
            findings.push({ kind, index: match.index, match: `${match[0].slice(0, 6)}…` });
        }
    }
    return findings.sort((a, b) => a.index - b.index);
}

/**
 * Replace every detected secret with `[REDACTED:<kind>]`. Returns the
 * redacted text plus the unmasked-length findings list.
 */
export function redactSecrets(text) {
    const findings = [];
    let output = String(text ?? '');
    for (const { kind, re } of SECRET_PATTERNS) {
        output = output.replace(re, (match, ...rest) => {
            const offset = rest.at(-2);
            findings.push({ kind, index: offset, match: `${match.slice(0, 6)}…` });
            return `[REDACTED:${kind}]`;
        });
        re.lastIndex = 0;
    }
    findings.sort((a, b) => a.index - b.index);
    return { text: output, findings };
}

/**
 * Roll a per-memory findings list into the export-level `secrets` report:
 * total findings, the kinds seen, and whether they were stripped.
 */
export function summarizeFindings(perMemory, redacted) {
    const findings = perMemory.reduce((sum, entry) => sum + entry.findings.length, 0);
    const kinds = [...new Set(perMemory.flatMap((entry) => entry.findings.map((f) => f.kind)))];
    return { findings, kinds, redacted, memories: perMemory.length };
}
