#!/usr/bin/env node

/**
 * OpenSelf CLI — Your AI clone. Your messages. Your machine.
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
import { wrapAction, handleError } from './utils/error-handler.js';

// Notify users of new versions (cached; non-blocking; ignored in CI/sandbox)
try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'));
    updateNotifier({ pkg, updateCheckInterval: 1000 * 60 * 60 * 24 }).notify({ isGlobal: true });
} catch {
    // Silent — notifier shouldn't break CLI in restricted environments
}

const program = new Command();

program
    .name('openself')
    .description('🧑 OpenSelf — Your AI clone. Your messages. Your machine.')
    .version('0.6.0')
    .addHelpText(
        'after',
        `
${chalk.bold('Quick Start:')}
  ${chalk.gray('$')} openself setup                              ${chalk.dim('# Configure API key')}
  ${chalk.gray('$')} openself feed --whatsapp ./chat.txt --name "You"  ${chalk.dim('# Feed personality')}
  ${chalk.gray('$')} openself test                               ${chalk.dim('# Clone Score test')}
  ${chalk.gray('$')} openself start --telegram                   ${chalk.dim('# Go live')}

${chalk.bold('Fun Stuff:')}
  ${chalk.gray('$')} openself arena --topic "Coffee or bubble tea?"     ${chalk.dim('# Clone vs Clone')}
  ${chalk.gray('$')} openself ghost on                           ${chalk.dim('# Auto-reply offline')}
  ${chalk.gray('$')} openself share --web                        ${chalk.dim('# "Talk to My Clone"')}

${chalk.dim('Docs: https://github.com/Open-Self/open-self/tree/main/docs')}
`,
    );

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
