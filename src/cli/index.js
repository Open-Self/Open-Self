#!/usr/bin/env node

/**
 * OpenSelf CLI — Your AI clone. Your messages. Your machine.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { setupCommand } from './setup.js';
import { feedCommand } from './feed.js';
import { testCommand } from './test.js';
import { startCommand } from './start.js';
import { reviewCommand } from './review.js';
import { shareCommand } from './share.js';
import { arenaCommand } from './arena.js';
import { ghostCommand } from './ghost.js';
import { profileCommand } from './profile.js';

const program = new Command();

program
    .name('openself')
    .description('🧑 OpenSelf — Your AI clone. Your messages. Your machine.')
    .version('0.5.0')
    .addHelpText('after', `
${chalk.bold('Quick Start:')}
  ${chalk.gray('$')} openself setup                              ${chalk.dim('# Configure API key')}
  ${chalk.gray('$')} openself feed --whatsapp ./chat.txt --name "You"  ${chalk.dim('# Feed personality')}
  ${chalk.gray('$')} openself test                               ${chalk.dim('# Clone Score test')}
  ${chalk.gray('$')} openself start --telegram                   ${chalk.dim('# Go live')}

${chalk.bold('Fun Stuff:')}
  ${chalk.gray('$')} openself arena --topic "Cà phê hay trà sữa?"     ${chalk.dim('# Clone vs Clone')}
  ${chalk.gray('$')} openself ghost on                           ${chalk.dim('# Auto-reply offline')}
  ${chalk.gray('$')} openself share --web                        ${chalk.dim('# "Talk to My Clone"')}

${chalk.dim('Docs: https://github.com/Open-Self/open-self/tree/main/docs')}
`);

program
    .command('setup')
    .description('Interactive setup wizard — configure API key and preferences')
    .action(setupCommand);

program
    .command('feed')
    .description('Feed chat history to train your clone personality')
    .option('--whatsapp <files...>', 'WhatsApp export .txt files')
    .option('--telegram <files...>', 'Telegram export JSON files')
    .option('--manual <files...>', 'Manual personality brief (markdown/text)')
    .option('--name <name>', 'Your name (for identifying your messages)')
    .action(feedCommand);

program
    .command('test')
    .description('Test your clone — score test or interactive chat')
    .option('--count <n>', 'Number of test conversations', '10')
    .option('--interactive', 'Live chat with your clone in the terminal')
    .option('--provider <name>', 'LLM provider (anthropic/openai/deepseek/ollama)')
    .action(testCommand);

program
    .command('start')
    .description('Start your clone on messaging apps')
    .option('--telegram', 'Connect to Telegram')
    .option('--whatsapp', 'Connect to WhatsApp')
    .option('--discord', 'Connect to Discord')
    .action(startCommand);

program
    .command('share')
    .description('Share your clone — "Talk to My Clone" web page')
    .option('--web', 'Launch web chat page')
    .option('--port <port>', 'Server port', '3000')
    .action(shareCommand);

program
    .command('review')
    .description('Review what your clone said — daily report')
    .action(reviewCommand);

program
    .command('arena')
    .description('🏟️ Clone Arena — two clones debate each other')
    .option('--topic <topic>', 'Debate topic', 'Cà phê hay trà sữa?')
    .option('--rounds <n>', 'Number of exchange rounds', '5')
    .option('--soul2 <path>', 'Second clone SOUL.md path')
    .option('--name2 <name>', 'Second clone name')
    .option('--provider <name>', 'LLM provider')
    .option('--export', 'Save transcript to file')
    .action(arenaCommand);

program
    .command('ghost')
    .description('👻 Ghost Mode — clone replies when you are offline')
    .argument('[action]', 'on/off/status/ping', 'status')
    .action((action, options) => ghostCommand([action], options));

program
    .command('profile')
    .description('👤 Export/import personality profiles')
    .argument('[action]', 'export/import/info', 'info')
    .option('--file <path>', 'Profile file to import')
    .option('--output <dir>', 'Export output directory', '.')
    .action((action, options) => profileCommand(action, options));

// Global error handler — friendly messages instead of raw stack traces
process.on('uncaughtException', (err) => {
    console.error('');
    console.error(chalk.red('❌ Something went wrong:'));
    console.error(chalk.white(`   ${err.message}`));
    console.error('');

    if (err.message.includes('ENOENT')) {
        console.error(chalk.yellow('💡 File not found. Check the file path and try again.'));
    } else if (err.message.includes('API') || err.message.includes('401') || err.message.includes('403')) {
        console.error(chalk.yellow('💡 API error. Check your API key in .env or run: openself setup'));
    } else if (err.message.includes('ECONNREFUSED')) {
        console.error(chalk.yellow('💡 Connection refused. Is Ollama running? Try: ollama serve'));
    } else {
        console.error(chalk.yellow('💡 Try: openself setup   or   openself --help'));
    }

    console.error(chalk.dim(`\n   Full error: ${err.stack?.split('\n')[1]?.trim() || ''}`));
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    throw reason instanceof Error ? reason : new Error(String(reason));
});

program.parse();
