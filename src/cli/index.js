#!/usr/bin/env node

/**
 * OpenSelf CLI — Your AI clone. Your messages. Your machine.
 */

import { Command } from 'commander';
import { setupCommand } from './setup.js';
import { feedCommand } from './feed.js';
import { testCommand } from './test.js';
import { startCommand } from './start.js';
import { reviewCommand } from './review.js';
import { shareCommand } from './share.js';
import { arenaCommand } from './arena.js';
import { ghostCommand } from './ghost.js';

const program = new Command();

program
    .name('openself')
    .description('🧑 OpenSelf — Your AI clone. Your messages. Your machine.')
    .version('0.3.0');

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

program.parse();
