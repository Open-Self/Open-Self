import chalk from 'chalk';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { CONNECT_TARGETS, httpServerEntry, stdioServerEntry } from './connect-targets.js';

const SERVER_NAME = 'openself';

/**
 * Wire a compatible MCP client to this vault. Every writer is idempotent,
 * creates a timestamped backup before touching an existing file, supports
 * --dry-run, and can cleanly remove the entry with --remove.
 */
export function connectCommand(client, options = {}) {
    if (!client) return listTargets(options);
    const target = CONNECT_TARGETS[client];
    if (!target) {
        throw new Error(
            `Unknown client "${client}". Supported: ${Object.keys(CONNECT_TARGETS).join(', ')}.`,
        );
    }
    const useHttp = Boolean(options.http) || options.transport === 'http';
    const entry = useHttp ? httpServerEntry(options) : stdioServerEntry(options);

    if (target.format === 'print') {
        const config = { mcpServers: { [SERVER_NAME]: entry } };
        const output = { client, format: 'mcpServers JSON', config };
        if (options.json) {
            console.log(JSON.stringify(output, null, 2));
        } else {
            console.log(chalk.bold(`${target.label} configuration`));
            console.log(JSON.stringify(config, null, 2));
            if (useHttp && !options.token) {
                console.log(
                    chalk.gray(
                        'The HTTP server generates a bearer token at startup — copy it into an Authorization header if the client supports headers.',
                    ),
                );
            }
        }
        return output;
    }

    const scope = options.project ? 'project' : 'user';
    const pathFor = target.paths[scope] || target.paths[target.defaultScope];
    if (!pathFor) {
        throw new Error(`${target.label} does not support ${scope}-level configuration here`);
    }
    const configPath = resolve(pathFor(process.cwd()));

    if (target.format === 'toml') {
        return writeTomlConfig(target, configPath, entry, options);
    }
    return writeJsonConfig(target, configPath, entry, options);
}

function listTargets(options = {}) {
    const rows = Object.entries(CONNECT_TARGETS).map(([id, target]) => ({
        client: id,
        label: target.label,
        format: target.format,
        configPaths: target.paths
            ? Object.fromEntries(
                  Object.entries(target.paths).map(([scope, resolvePath]) => [
                      scope,
                      resolvePath(process.cwd()),
                  ]),
              )
            : null,
    }));
    if (options.json) {
        console.log(JSON.stringify({ clients: rows }, null, 2));
        return rows;
    }
    console.log(chalk.bold('Supported MCP clients'));
    for (const row of rows) {
        console.log(`  ${chalk.cyan(row.client.padEnd(9))} ${row.label}`);
        for (const [scope, path] of Object.entries(row.configPaths || {})) {
            const state = existsSync(path) ? 'found' : 'will create';
            console.log(`      ${chalk.gray(`${scope}: ${path} (${state})`)}`);
        }
    }
    console.log(
        chalk.gray(
            '\nUsage: openself connect <client> [--project] [--dry-run] [--remove] [--http]',
        ),
    );
    return rows;
}

function writeJsonConfig(target, configPath, entry, options) {
    const exists = existsSync(configPath);
    let document = {};
    let hadComments = false;
    if (exists) {
        const raw = readFileSync(configPath, 'utf8');
        const parsed = parseJsonLoose(raw);
        document = parsed.value;
        hadComments = parsed.modified;
        if (typeof document !== 'object' || document === null || Array.isArray(document)) {
            throw new Error(
                `${configPath} does not contain a JSON object — fix or remove it first`,
            );
        }
    }
    const servers = { ...(document[target.key] || {}) };
    const changed = JSON.stringify(servers[SERVER_NAME]) !== JSON.stringify(entry);

    if (options.remove) {
        if (!exists || !(SERVER_NAME in servers)) {
            return report(target, configPath, 'not-installed', null, options);
        }
        delete servers[SERVER_NAME];
    } else {
        servers[SERVER_NAME] = entry;
    }
    const next = { ...document, [target.key]: servers };
    const action = options.remove
        ? 'removed'
        : changed
          ? exists
              ? 'updated'
              : 'created'
          : 'unchanged';

    if (options.dryRun) {
        return report(target, configPath, `dry-run:${action}`, next, options);
    }
    if (action !== 'unchanged') {
        mkdirSync(dirname(configPath), { recursive: true });
        const backup = exists ? backupFile(configPath) : null;
        writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
        return report(target, configPath, action, next, options, backup, hadComments);
    }
    return report(target, configPath, action, next, options);
}

function writeTomlConfig(target, configPath, entry, options) {
    const exists = existsSync(configPath);
    const raw = exists ? readFileSync(configPath, 'utf8') : '';
    const stripped = stripTomlSection(raw, `mcp_servers.${SERVER_NAME}`);
    const installed = stripped.removed;

    if (options.remove) {
        if (!installed) return report(target, configPath, 'not-installed', null, options);
        if (options.dryRun)
            return report(target, configPath, 'dry-run:removed', stripped.text, options);
        const backup = backupFile(configPath);
        writeFileSync(configPath, stripped.text.trimEnd() + '\n', 'utf8');
        return report(target, configPath, 'removed', stripped.text, options, backup);
    }

    const block = tomlServerBlock(entry);
    const next = `${stripped.text.trimEnd()}\n\n${block}`.trimStart();
    const action = exists ? (installed ? 'updated' : 'updated') : 'created';
    if (options.dryRun) return report(target, configPath, `dry-run:${action}`, next, options);
    mkdirSync(dirname(configPath), { recursive: true });
    const backup = exists ? backupFile(configPath) : null;
    writeFileSync(configPath, next.trimEnd() + '\n', 'utf8');
    return report(target, configPath, action, next, options, backup);
}

function tomlServerBlock(entry) {
    const lines = [`[mcp_servers.${SERVER_NAME}]`];
    if (entry.type === 'http') {
        lines.push(`type = ${tomlString('http')}`);
        lines.push(`url = ${tomlString(entry.url)}`);
        if (entry.headers?.Authorization) {
            lines.push('');
            lines.push(`[mcp_servers.${SERVER_NAME}.headers]`);
            lines.push(`Authorization = ${tomlString(entry.headers.Authorization)}`);
        }
        return lines.join('\n');
    }
    lines.push(`command = ${tomlString(entry.command)}`);
    lines.push(`args = [${(entry.args || []).map(tomlString).join(', ')}]`);
    if (entry.env) {
        lines.push('');
        lines.push(`[mcp_servers.${SERVER_NAME}.env]`);
        for (const [key, value] of Object.entries(entry.env)) {
            lines.push(`${key} = ${tomlString(value)}`);
        }
    }
    return lines.join('\n');
}

function tomlString(value) {
    return JSON.stringify(String(value));
}

/** Remove `[name]` and `[name.*]` TOML tables. Returns text plus whether anything was removed. */
function stripTomlSection(text, name) {
    const lines = text.split(/\r?\n/);
    const kept = [];
    let removed = false;
    let skipping = false;
    for (const line of lines) {
        const header = line.trim().match(/^\[\s*([^\]]+)\s*\]$/);
        if (header) {
            const table = header[1].trim();
            skipping = table === name || table.startsWith(`${name}.`);
            if (skipping) removed = true;
        }
        if (!skipping) kept.push(line);
    }
    return { text: kept.join('\n'), removed };
}

/** JSON with comments/trailing commas tolerated (JSONC). */
function parseJsonLoose(raw) {
    try {
        return { value: JSON.parse(raw), modified: false };
    } catch {
        const cleaned = raw
            .replace(/"(?:[^"\\]|\\.)*"|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (match) =>
                match.startsWith('"') ? match : '',
            )
            .replace(/,\s*([}\]])/g, '$1');
        return { value: JSON.parse(cleaned), modified: true };
    }
}

function backupFile(configPath) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = `${configPath}.openself-${stamp}.bak`;
    copyFileSync(configPath, backup);
    return backup;
}

function report(
    target,
    configPath,
    action,
    document,
    options,
    backup = null,
    commentsDropped = false,
) {
    const result = { client: target.label, configPath, action, backup, config: document };
    if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return result;
    }
    const color = action.startsWith('dry-run') ? chalk.yellow : chalk.green;
    console.log(`${color('•')} ${target.label}: ${action} ${chalk.gray(configPath)}`);
    if (backup) console.log(chalk.gray(`  backup: ${backup}`));
    if (commentsDropped) {
        console.log(
            chalk.yellow(
                '  note: comments in the original JSONC file were not preserved; the backup retains them',
            ),
        );
    }
    if (!options.remove && action !== 'unchanged') {
        console.log(chalk.gray('  restart the client so it picks up the openself server'));
    }
    if (target.notes) console.log(chalk.gray(`  ${target.notes}`));
    return result;
}
