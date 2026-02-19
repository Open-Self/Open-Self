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

const program = new Command();

program
    .name('openself')
    .description('🧑 OpenSelf — Your AI clone. Your messages. Your machine.')
    .version('0.1.0');

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
    .description('Test your clone — see how accurately it mimics you')
    .option('--count <n>', 'Number of test conversations', '10')
    .option('--provider <name>', 'LLM provider (anthropic/openai/deepseek/ollama)')
    .action(testCommand);

program
    .command('start')
    .description('Start your clone on messaging apps (coming soon)')
    .option('--telegram', 'Connect to Telegram')
    .option('--whatsapp', 'Connect to WhatsApp')
    .option('--discord', 'Connect to Discord')
    .action(startCommand);

program
    .command('review')
    .description('Review what your clone said — daily report')
    .action(reviewCommand);

program.parse();
