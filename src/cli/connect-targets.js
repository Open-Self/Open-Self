import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const home = () => homedir();

function vscodeUserPath() {
    if (platform() === 'darwin') {
        return join(home(), 'Library', 'Application Support', 'Code', 'User', 'mcp.json');
    }
    if (platform() === 'win32') {
        return join(
            process.env.APPDATA || join(home(), 'AppData', 'Roaming'),
            'Code',
            'User',
            'mcp.json',
        );
    }
    return join(home(), '.config', 'Code', 'User', 'mcp.json');
}

/**
 * Client targets whose documented MCP configuration formats we can safely
 * transform. `key` is the JSON object that holds named server entries.
 * `paths.project` is resolved against the current working directory.
 */
export const CONNECT_TARGETS = {
    claude: {
        label: 'Claude Code',
        format: 'json',
        key: 'mcpServers',
        paths: {
            user: () => join(home(), '.claude.json'),
            project: (cwd) => join(cwd, '.mcp.json'),
        },
        defaultScope: 'user',
        notes: 'Claude Code reads project servers from .mcp.json and user servers from ~/.claude.json.',
    },
    cursor: {
        label: 'Cursor',
        format: 'json',
        key: 'mcpServers',
        paths: {
            user: () => join(home(), '.cursor', 'mcp.json'),
            project: (cwd) => join(cwd, '.cursor', 'mcp.json'),
        },
        defaultScope: 'user',
    },
    windsurf: {
        label: 'Windsurf',
        format: 'json',
        key: 'mcpServers',
        paths: {
            user: () => join(home(), '.codeium', 'windsurf', 'mcp_config.json'),
        },
        defaultScope: 'user',
    },
    vscode: {
        label: 'VS Code',
        format: 'jsonc',
        key: 'servers',
        paths: {
            user: vscodeUserPath,
            project: (cwd) => join(cwd, '.vscode', 'mcp.json'),
        },
        defaultScope: 'project',
        notes: 'VS Code workspace MCP configuration uses a top-level "servers" object.',
    },
    codex: {
        label: 'OpenAI Codex',
        format: 'toml',
        paths: {
            user: () => join(home(), '.codex', 'config.toml'),
        },
        defaultScope: 'user',
        notes: 'Codex reads stdio MCP servers from [mcp_servers.<name>] tables in config.toml.',
    },
    generic: {
        label: 'Generic MCP client',
        format: 'print',
        notes: 'Prints a validated configuration block to copy into any MCP-compatible client.',
    },
};

/**
 * Build the stdio server entry OpenSelf writes into client configuration.
 */
export function stdioServerEntry(options = {}) {
    const args = ['-y', 'openself', 'mcp'];
    if (options.policy) {
        args.push('--policy', options.policy, '--client', options.client || 'agent');
    } else if (options.client && options.client !== 'agent') {
        args.push('--client', options.client);
    }
    if (options.dataDir) args.push('--data-dir', options.dataDir);
    if (options.command) {
        return {
            command: options.command,
            args: options.commandArgs || ['mcp'],
            env: envBlock(options),
        };
    }
    return { command: 'npx', args, env: envBlock(options) };
}

/**
 * Build the HTTP server entry for clients that support streamable HTTP.
 */
export function httpServerEntry(options = {}) {
    const entry = {
        type: 'http',
        url: options.url || 'http://127.0.0.1:3211/mcp',
    };
    if (options.token) {
        entry.headers = { Authorization: `Bearer ${options.token}` };
    }
    return entry;
}

function envBlock(options) {
    const env = {};
    if (options.dataDir) env.DATA_DIR = options.dataDir;
    return Object.keys(env).length ? env : undefined;
}
