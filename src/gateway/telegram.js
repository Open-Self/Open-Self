/**
 * Telegram Gateway
 * Live messaging via Telegram Bot API using grammy
 */

import { Bot } from 'grammy';
import { ClonePipeline } from '../brain/pipeline.js';
import { TimingEngine } from '../mimicry/timing.js';
import chalk from 'chalk';

export class TelegramGateway {
    constructor(config = {}) {
        const token = config.token || process.env.TELEGRAM_BOT_TOKEN;
        if (!token) {
            throw new Error('TELEGRAM_BOT_TOKEN is required. Get one from @BotFather on Telegram.');
        }

        this.bot = new Bot(token);
        this.pipeline = new ClonePipeline({ config: config.appConfig });
        this.timing = new TimingEngine();
        this.contacts = new Map();
        this.stats = { received: 0, replied: 0, ignored: 0, queued: 0 };
    }

    /**
     * Start the bot
     */
    async start() {
        // Handle text messages
        this.bot.on('message:text', async (ctx) => {
            await this._handleMessage(ctx);
        });

        // Handle stickers/photos with caption
        this.bot.on('message', async (ctx) => {
            if (ctx.message.caption) {
                await this._handleMessage(ctx, ctx.message.caption);
            }
        });

        // Error handling
        this.bot.catch((err) => {
            console.error(chalk.red('Telegram bot error:'), err.message);
        });

        // Start polling
        console.log(chalk.green('🤖 Telegram bot started. Waiting for messages...'));
        console.log(chalk.gray('   Press Ctrl+C to stop'));

        await this.bot.start();
    }

    /**
     * Handle an incoming message
     */
    async _handleMessage(ctx, textOverride) {
        this.stats.received++;

        const text = textOverride || ctx.message.text;
        const chatId = ctx.chat.id;
        const contact = {
            name: ctx.from?.first_name || 'Unknown',
            username: ctx.from?.username || '',
            chatId,
            isGroup: ctx.chat.type !== 'private',
            channel: 'Telegram',
        };

        // Group chat: only reply if mentioned or replied to
        if (contact.isGroup) {
            const botInfo = await this.bot.api.getMe();
            const mentioned = text.includes(`@${botInfo.username}`);
            const isReply = ctx.message.reply_to_message?.from?.id === botInfo.id;

            if (!mentioned && !isReply) {
                this.stats.ignored++;
                return;
            }
        }

        console.log(chalk.cyan(`📨 ${contact.name}: "${text.slice(0, 60)}${text.length > 60 ? '...' : ''}"`));

        try {
            // Process through pipeline
            const result = await this.pipeline.processMessage(
                { text, isGroup: contact.isGroup },
                contact,
            );

            if (result.action === 'ignore') {
                this.stats.ignored++;
                console.log(chalk.gray(`   → Ignored (mimicry)`));
                return;
            }

            if (result.action === 'queued') {
                this.stats.queued++;
                console.log(chalk.yellow(`   → Queued for review`));
                return;
            }

            if (result.action === 'blocked') {
                console.log(chalk.red(`   → Blocked by safety guard`));
                return;
            }

            if (result.action === 'reply' && result.replies.length > 0) {
                // Simulate human delay
                const readDelay = Math.min(result.delay * 0.3, 5000);
                await TimingEngine.sleep(readDelay);

                // Send each reply part
                for (let i = 0; i < result.replies.length; i++) {
                    // Typing indicator
                    await ctx.replyWithChatAction('typing');
                    const typingTime = Math.min(result.replies[i].length * 60, 4000);
                    await TimingEngine.sleep(typingTime);

                    // Send
                    await ctx.reply(result.replies[i]);
                    console.log(chalk.green(`   → "${result.replies[i].slice(0, 60)}${result.replies[i].length > 60 ? '...' : ''}"`));

                    // Inter-message delay
                    if (i < result.replies.length - 1) {
                        await TimingEngine.sleep(1000 + Math.random() * 2000);
                    }
                }

                this.stats.replied++;
            }
        } catch (err) {
            console.error(chalk.red(`   → Error: ${err.message}`));
        }
    }

    /**
     * Stop the bot
     */
    stop() {
        this.bot.stop();
        console.log(chalk.yellow('\n🛑 Telegram bot stopped'));
        console.log(chalk.white(`   Messages: ${this.stats.received} received, ${this.stats.replied} replied, ${this.stats.ignored} ignored, ${this.stats.queued} queued`));
    }

    getStats() {
        return this.stats;
    }
}
