/**
 * `openself start` — Start clone on messaging apps
 */

import chalk from 'chalk';
import { TelegramGateway } from '../gateway/telegram.js';
import { DiscordGateway } from '../gateway/discord.js';
import { loadConfig } from '../config/loader.js';

export async function startCommand(options) {
    console.log('');
    console.log(chalk.bold.cyan('🚀 OpenSelf — Start Clone'));
    console.log(chalk.gray('━'.repeat(40)));
    console.log('');

    if (options.telegram) {
        const config = loadConfig();

        if (!process.env.TELEGRAM_BOT_TOKEN) {
            console.log(chalk.red('❌ TELEGRAM_BOT_TOKEN not set.'));
            console.log('');
            console.log(chalk.white('How to get a Telegram bot token:'));
            console.log(chalk.cyan('  1. Open Telegram and search for @BotFather'));
            console.log(chalk.cyan('  2. Send /newbot and follow the instructions'));
            console.log(chalk.cyan('  3. Copy the token and add to .env:'));
            console.log(chalk.yellow('     TELEGRAM_BOT_TOKEN=your-token-here'));
            console.log('');
            return;
        }

        console.log(chalk.white('  📱 Starting Telegram bot...'));
        console.log('');

        const gateway = new TelegramGateway({ appConfig: config });

        process.on('SIGINT', () => gateway.stop());
        process.on('SIGTERM', () => gateway.stop());

        await gateway.start();

    } else if (options.discord) {
        const config = loadConfig();

        if (!process.env.DISCORD_BOT_TOKEN) {
            console.log(chalk.red('❌ DISCORD_BOT_TOKEN not set.'));
            console.log('');
            console.log(chalk.white('How to get a Discord bot token:'));
            console.log(chalk.cyan('  1. Go to https://discord.com/developers/applications'));
            console.log(chalk.cyan('  2. Create New Application → Bot → Copy token'));
            console.log(chalk.cyan('  3. Enable "Message Content Intent" in Bot settings'));
            console.log(chalk.cyan('  4. Add to .env:'));
            console.log(chalk.yellow('     DISCORD_BOT_TOKEN=your-token-here'));
            console.log('');
            return;
        }

        console.log(chalk.white('  🤖 Starting Discord bot...'));
        console.log('');

        const gateway = new DiscordGateway({ appConfig: config });

        process.on('SIGINT', () => gateway.stop());
        process.on('SIGTERM', () => gateway.stop());

        await gateway.start();

    } else if (options.whatsapp) {
        console.log(chalk.yellow('📱 WhatsApp gateway coming in Week 4'));
        console.log(chalk.gray('   Will use Baileys (unofficial WhatsApp Web API)'));
    } else {
        console.log(chalk.white('Choose a platform to connect:'));
        console.log('');
        console.log(chalk.green('  ✅ Telegram') + chalk.gray(' — Ready!'));
        console.log(chalk.yellow('     npx openself start --telegram'));
        console.log('');
        console.log(chalk.green('  ✅ Discord') + chalk.gray(' — Ready!'));
        console.log(chalk.yellow('     npx openself start --discord'));
        console.log('');
        console.log(chalk.gray('  ⏳ WhatsApp — Coming Week 4'));
    }
    console.log('');
}
