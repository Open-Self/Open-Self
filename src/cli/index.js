#!/usr/bin/env node

/**
 * OpenSelf CLI — Your context. Your memory. Your rules.
 */

import { packageVersion } from '../version.js';
import { auditCommand } from './audit.js';
import { Command } from 'commander';
import chalk from 'chalk';
import updateNotifier from 'update-notifier';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { setupCommand } from './setup.js';
import { feedCommand } from './feed.js';
import { testCommand } from './test.js';
import { startCommand } from './start.js';
import { reviewCommand } from './review.js';
import { shareCommand } from './share.js';
import { arenaCommand } from './arena.js';
import { ghostCommand } from './ghost.js';
import { profileCommand } from './profile.js';
import { memoryCommand } from './memory.js';
import { mcpCommand } from './mcp.js';
import { initCommand } from './init.js';
import { doctorCommand } from './doctor.js';
import { contextCommand } from './context.js';
import { inboxCommand } from './inbox.js';
import { demoCommand } from './demo.js';
import { connectCommand } from './connect.js';
import { skillCommand } from './skill.js';
import { dashboardCommand } from './dashboard.js';
import { captureCommand } from './capture.js';
import { vaultCommand } from './vault.js';
import { wrapAction, handleError } from './utils/error-handler.js';

// Notify users of new versions (cached; non-blocking; ignored in CI/sandbox)
try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'));
    if (!process.argv.includes('mcp')) {
        updateNotifier({ pkg, updateCheckInterval: 1000 * 60 * 60 * 24 }).notify({
            isGlobal: true,
        });
    }
} catch {
    // Silent — notifier shouldn't break CLI in restricted environments
}

const program = new Command();

program
    .name('openself')
    .description('OpenSelf — Private, persistent context for every AI you use.')
    .version(packageVersion)
    .addHelpText(
        'after',
        `
${chalk.bold('Quick Start:')}
  ${chalk.gray('$')} openself init                                                 ${chalk.dim('# Create your vault')}
  ${chalk.gray('$')} openself demo                                                 ${chalk.dim('# See two agents share context')}
  ${chalk.gray('$')} openself memory add --type decision --content "Use SQLite"    ${chalk.dim('# Remember')}
  ${chalk.gray('$')} openself context "What database?" --explain                   ${chalk.dim('# Recall, with receipts')}
  ${chalk.gray('$')} openself connect claude                                       ${chalk.dim('# Wire an agent client')}

${chalk.bold('Personality tools (legacy-compatible):')}
  ${chalk.gray('$')} openself feed --whatsapp ./chat.txt --name "You"
  ${chalk.gray('$')} openself test

${chalk.dim('Docs: https://github.com/Open-Self/open-self/tree/main/docs')}
`,
    );

program
    .command('memory')
    .description('Import, store, search, list, and forget personal context')
    .argument(
        '[action]',
        'add/import/export/index/search/conflicts/list/forget/sweep/stats',
        'list',
    )
    .option('--file <paths...>', 'Files to import (or the export destination for export)')
    .option(
        '--format <format>',
        'auto/markdown/text/whatsapp/telegram/openself (export is JSONL)',
        'auto',
    )
    .option('--include-restricted', 'Include restricted memories in an export')
    .option('--redact', 'Strip secret-shaped strings from an export')
    .option('--no-sign', 'Do not sign the export with the vault identity')
    .option('--content <text>', 'Memory content')
    .option('--query <text>', 'Search query')
    .option('--id <uuid>', 'Memory ID')
    .option('--type <type>', 'fact/preference/decision/commitment/relationship/event/note')
    .option('--summary <text>', 'Short summary')
    .option('--scope <scope>', 'Access scope (defaults to personal when adding)')
    .option('--sensitivity <level>', 'public/personal/private/restricted')
    .option('--max-sensitivity <level>', 'Maximum sensitivity returned', 'private')
    .option('--retrieval <mode>', 'hybrid/lexical/vector', 'hybrid')
    .option('--min-source-trust <level>', 'untrusted/external/trusted/verified/owner')
    .option('--threshold <number>', 'Similarity threshold for conflict detection')
    .option('--confidence <number>', 'Confidence from 0 to 1')
    .option('--source-kind <kind>', 'Source type', 'manual')
    .option('--source <locator>', 'Source URL or file path')
    .option('--source-title <title>', 'Human-readable source title')
    .option('--occurred-at <iso-date>', 'When the memory occurred')
    .option('--valid-from <iso-date>', 'When the memory became valid')
    .option('--valid-to <iso-date>', 'When the memory stops being valid')
    .option('--tags <csv>', 'Comma-separated tags')
    .option('--dry-run', 'Inspect an import without writing memories')
    .option('--limit <number>', 'Maximum results')
    .option('--include-forgotten', 'Include forgotten memories when listing')
    .option('--embeddings <provider>', 'Vector provider: feature-hash/ollama/openai-compatible')
    .option('--data-dir <path>', 'OpenSelf data directory')
    .action(wrapAction((action, options) => memoryCommand(action, options)));

program
    .command('init')
    .description('Initialize the OpenSelf Context Vault (idempotent)')
    .option('--data-dir <path>', 'OpenSelf data directory')
    .option('--encrypt', 'Encrypt new memories at rest')
    .option('--json', 'Emit a JSON report')
    .action(wrapAction(initCommand));

program
    .command('doctor')
    .description('Check vault health, schema, audit, and policy configuration')
    .option('--data-dir <path>', 'OpenSelf data directory')
    .option('--json', 'Emit a JSON report')
    .action(wrapAction(doctorCommand));

program
    .command('context')
    .description('Build agent context for a query — --explain shows the context receipt')
    .argument('[query]', 'Context query')
    .option('--scope <scope>', 'Scope root filter')
    .option('--type <type>', 'Memory type filter')
    .option('--mode <mode>', 'Retrieval mode: hybrid/lexical/vector')
    .option('--max-chars <chars>', 'Character budget')
    .option('--as-of <iso>', 'Evaluate temporal validity at a point in time')
    .option('--min-source-trust <level>', 'untrusted/external/trusted/verified/owner')
    .option('--max-sensitivity <level>', 'public/personal/private/restricted')
    .option('--limit <number>', 'Maximum candidate memories')
    .option('--explain', 'Include a context receipt explaining selection')
    .option('--embeddings <provider>', 'Vector provider: feature-hash/ollama/openai-compatible')
    .option('--json', 'Emit JSON')
    .option('--data-dir <path>', 'OpenSelf data directory')
    .action(wrapAction((query, options) => contextCommand(query, options)));

program
    .command('demo')
    .description('Disposable two-agent demo in a temporary vault — no API keys needed')
    .option('--keep', 'Keep the demo vault instead of deleting it')
    .option('--data-dir <path>', 'Vault directory to use with --keep')
    .option('--json', 'Emit the demo transcript as JSON')
    .action(wrapAction(demoCommand));

program
    .command('connect')
    .description('Generate agent client MCP config (claude/cursor/vscode/windsurf/codex/generic)')
    .argument('<target>', 'claude, cursor, vscode, windsurf, codex, or generic')
    .option('--client <id>', 'OpenSelf client identity granted to this agent', 'agent')
    .option('--policy <path>', 'Owner-managed MCP policy JSON to reference')
    .option('--data-dir <path>', 'OpenSelf data directory the server should use')
    .option('--token <token>', 'Bearer token to embed for http transport')
    .option('--transport <mode>', 'stdio or http', 'stdio')
    .option('--url <url>', 'HTTP MCP endpoint', 'http://127.0.0.1:3211/mcp')
    .option('--project', 'Write project-level config instead of user-level')
    .option('--dry-run', 'Print the change without writing files')
    .option('--remove', 'Remove the openself entry')
    .option('--json', 'Emit JSON')
    .action(wrapAction((target, options) => connectCommand(target, options)));

program
    .command('inbox')
    .description('Owner review inbox for agent memory proposals')
    .argument('[action]', 'list/approve/reject', 'list')
    .option('--id <id>', 'Proposal ID (required for approve/reject)')
    .option('--status <status>', 'Filter: pending/approved/rejected')
    .option('--client <id>', 'Filter proposals by proposing client')
    .option('--limit <number>', 'Maximum proposals listed')
    .option('--note <note>', 'Review note')
    .option('--content <text>', 'Override content on approval')
    .option('--type <type>', 'Override type on approval')
    .option('--tags <csv>', 'Override tags on approval')
    .option('--scope <scope>', 'Override scope on approval')
    .option('--sensitivity <level>', 'Override sensitivity on approval')
    .option('--source-trust <level>', 'Override source trust on approval')
    .option('--data-dir <path>', 'OpenSelf data directory')
    .option('--json', 'Emit JSON')
    .action(wrapAction((action, options) => inboxCommand(action, options)));

program
    .command('skill')
    .description('Manage the bundled OpenSelf Agent Skill')
    .argument('[action]', 'path/validate/install/uninstall', 'path')
    .option('--project', 'Install into ./.agents/skills instead of ~/.agents/skills')
    .option('--target <dir>', 'Explicit skills directory')
    .option('--force', 'Reinstall over an existing copy')
    .option('--dry-run', 'Print the change without writing files')
    .option('--json', 'Emit JSON')
    .action(wrapAction((action, options) => skillCommand(action, options)));

program
    .command('mcp')
    .description('Run the OpenSelf Context MCP server (stdio default, --http for streamable HTTP)')
    .option('--policy <path>', 'Owner-managed MCP policy JSON')
    .option('--client <id>', 'Client identity selected by the owner')
    .option('--http', 'Serve streamable HTTP instead of stdio')
    .option('--host <host>', 'HTTP bind host (loopback only unless --allow-remote)', '127.0.0.1')
    .option('--port <port>', 'HTTP port', '3211')
    .option('--token <token>', 'Bearer token for HTTP (or OPENSELF_MCP_TOKEN)')
    .option('--allow-remote', 'Permit non-loopback HTTP binds; requires --token')
    .option('--audit-retention-days <days>', 'Audit retention in days', '30')
    .option('--audit-max-entries <count>', 'Maximum retained audit entries', '10000')
    .option('--embeddings <provider>', 'Vector provider: feature-hash/ollama/openai-compatible')
    .option('--data-dir <path>', 'OpenSelf data directory')
    .action(wrapAction(mcpCommand));

program
    .command('audit')
    .description('Inspect, verify, export, or prune tamper-evident MCP access metadata')
    .argument('[action]', 'list/verify/export/prune/clear', 'list')
    .option('--data-dir <path>', 'OpenSelf data directory')
    .option('--client <id>', 'Filter by owner-configured client identity')
    .option('--limit <count>', 'Maximum results', '50')
    .option('--file <path>', 'JSONL export destination (export action)')
    .option('--retention-days <days>', 'Retention in days', '30')
    .option('--max-entries <count>', 'Maximum retained entries', '10000')
    .option('--json', 'Emit JSON')
    .action(wrapAction(auditCommand));

program
    .command('dashboard')
    .description('Launch the authenticated local Context Vault dashboard')
    .option('--port <port>', 'Local dashboard port', '3210')
    .option('--data-dir <path>', 'OpenSelf data directory')
    .action(wrapAction(dashboardCommand));

program
    .command('capture')
    .description('Capture continuously changing context from a local source')
    .argument('<source>', 'project/calendar/email/browser')
    .argument('[path]', 'Project folder or local export path')
    .option('--watch', 'Keep scanning for changes')
    .option('--interval <seconds>', 'Watch polling interval', '5')
    .option('--name <name>', 'Project name used to derive the default scope')
    .option('--scope <scope>', 'Vault scope (defaults to project/<folder-name>)')
    .option('--sensitivity <level>', 'public/personal/private/restricted', 'private')
    .option('--extensions <csv>', 'Allowed file extensions, such as md,js,ts')
    .option('--ignore <csv>', 'Additional directory names to ignore')
    .option('--max-file-bytes <bytes>', 'Maximum file size', '256000')
    .option('--limit <number>', 'Maximum structured records per scan', '1000')
    .option('--dry-run', 'Report changes without writing memories or connector state')
    .option('--data-dir <path>', 'OpenSelf data directory')
    .action(wrapAction((source, path, options) => captureCommand(source, path, options)));

program
    .command('vault')
    .description('Encrypt, back up, and restore the Context Vault')
    .argument('[action]', 'init/status/backup/restore', 'status')
    .option('--data-dir <path>', 'OpenSelf data directory')
    .option('--file <path>', 'Encrypted backup file to create or restore')
    .option('--passphrase-file <path>', 'Read the backup passphrase from a protected file')
    .action(wrapAction((action, options) => vaultCommand(action, options)));

program
    .command('setup')
    .description('Interactive setup wizard — configure API key and preferences')
    .action(wrapAction(setupCommand));

program
    .command('feed')
    .description('Feed chat history to train your clone personality')
    .option('--whatsapp <files...>', 'WhatsApp export .txt files')
    .option('--telegram <files...>', 'Telegram export JSON files')
    .option('--manual <files...>', 'Manual personality brief (markdown/text)')
    .option('--name <name>', 'Your name (for identifying your messages)')
    .action(wrapAction(feedCommand));

program
    .command('test')
    .description('Test your clone — score test or interactive chat')
    .option('--count <n>', 'Number of test conversations', '10')
    .option('--interactive', 'Live chat with your clone in the terminal')
    .option('--provider <name>', 'LLM provider (anthropic/openai/deepseek/ollama)')
    .action(wrapAction(testCommand));

program
    .command('start')
    .description('Start your clone on messaging apps')
    .option('--telegram', 'Connect to Telegram')
    .option('--whatsapp', 'Connect to WhatsApp')
    .option('--discord', 'Connect to Discord')
    .action(wrapAction(startCommand));

program
    .command('share')
    .description('Share your clone — "Talk to My Clone" web page')
    .option('--web', 'Launch web chat page')
    .option('--port <port>', 'Server port', '3000')
    .action(wrapAction(shareCommand));

program
    .command('review')
    .description('Review what your clone said — daily report')
    .action(wrapAction(reviewCommand));

program
    .command('arena')
    .description('🏟️ Clone Arena — two clones debate each other')
    .option('--topic <topic>', 'Debate topic', 'Coffee or bubble tea?')
    .option('--rounds <n>', 'Number of exchange rounds', '5')
    .option('--soul2 <path>', 'Second clone SOUL.md path')
    .option('--name2 <name>', 'Second clone name')
    .option('--provider <name>', 'LLM provider')
    .option('--export', 'Save transcript to file')
    .action(wrapAction(arenaCommand));

program
    .command('ghost')
    .description('👻 Ghost Mode — clone replies when you are offline')
    .argument('[action]', 'on/off/status/ping', 'status')
    .action(wrapAction((action, options) => ghostCommand([action], options)));

program
    .command('profile')
    .description('👤 Export/import personality profiles')
    .argument('[action]', 'export/import/info', 'info')
    .option('--file <path>', 'Profile file to import')
    .option('--output <dir>', 'Export output directory', '.')
    .action(wrapAction((action, options) => profileCommand(action, options)));

// Last-resort safety nets — `wrapAction` should catch most.
process.on('uncaughtException', handleError);
process.on('unhandledRejection', (reason) =>
    handleError(reason instanceof Error ? reason : new Error(String(reason))),
);

program.parse();
