#!/usr/bin/env node

/**
 * OpenSelf CLI — Your context. Your memory. Your rules.
 */

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
    .version('0.8.0')
    .addHelpText(
        'after',
        `
${chalk.bold('Quick Start:')}
  ${chalk.gray('$')} openself memory add --type decision --content "Use SQLite"  ${chalk.dim('# Remember')}
  ${chalk.gray('$')} openself memory search --query "database"                   ${chalk.dim('# Recall')}
  ${chalk.gray('$')} openself mcp                                                  ${chalk.dim('# Connect AI clients')}

${chalk.bold('Personality tools (legacy-compatible):')}
  ${chalk.gray('$')} openself feed --whatsapp ./chat.txt --name "You"
  ${chalk.gray('$')} openself test

${chalk.dim('Docs: https://github.com/Open-Self/open-self/tree/main/docs')}
`,
    );

program
    .command('memory')
    .description('Store, search, list, and forget personal context')
    .argument('[action]', 'add/search/list/forget/stats', 'list')
    .option('--content <text>', 'Memory content')
    .option('--query <text>', 'Search query')
    .option('--id <uuid>', 'Memory ID')
    .option('--type <type>', 'fact/preference/decision/commitment/relationship/event/note')
    .option('--summary <text>', 'Short summary')
    .option('--scope <scope>', 'Access scope (defaults to personal when adding)')
    .option('--sensitivity <level>', 'public/personal/private/restricted', 'personal')
    .option('--max-sensitivity <level>', 'Maximum sensitivity returned', 'private')
    .option('--confidence <number>', 'Confidence from 0 to 1')
    .option('--source-kind <kind>', 'Source type', 'manual')
    .option('--source <locator>', 'Source URL or file path')
    .option('--source-title <title>', 'Human-readable source title')
    .option('--occurred-at <iso-date>', 'When the memory occurred')
    .option('--valid-from <iso-date>', 'When the memory became valid')
    .option('--valid-to <iso-date>', 'When the memory stops being valid')
    .option('--tags <csv>', 'Comma-separated tags')
    .option('--limit <number>', 'Maximum results')
    .option('--include-forgotten', 'Include forgotten memories when listing')
    .option('--data-dir <path>', 'OpenSelf data directory')
    .action(wrapAction((action, options) => memoryCommand(action, options)));

program
    .command('mcp')
    .description('Run the OpenSelf Context MCP server over stdio')
    .option('--data-dir <path>', 'OpenSelf data directory')
    .action(wrapAction(mcpCommand));

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
