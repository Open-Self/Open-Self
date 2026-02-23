/**
 * Discord Gateway
 * Clone live on Discord via discord.js
 */

import { Client, GatewayIntentBits, Events } from 'discord.js';
import { ClonePipeline } from '../brain/pipeline.js';
import { TimingEngine } from '../mimicry/timing.js';
import chalk from 'chalk';

export class DiscordGateway {
    constructor(config = {}) {
        const token = config.token || process.env.DISCORD_BOT_TOKEN;
        if (!token) {
            throw new Error('DISCORD_BOT_TOKEN is required. Create a bot at https://discord.com/developers');
        }

        this.token = token;
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.DirectMessages,
                GatewayIntentBits.MessageContent,
            ],
        });
        this.pipeline = new ClonePipeline({ config: config.appConfig });
        this.stats = { received: 0, replied: 0, ignored: 0 };
    }

    async start() {
        this.client.on(Events.MessageCreate, async (message) => {
            await this._handleMessage(message);
        });

        this.client.once(Events.ClientReady, (c) => {
            console.log(chalk.green(`🤖 Discord bot logged in as ${chalk.cyan(c.user.tag)}`));
            console.log(chalk.gray('   Listening for DMs and @mentions...'));
            console.log(chalk.gray('   Press Ctrl+C to stop'));
        });

        await this.client.login(this.token);
    }

    async _handleMessage(message) {
        // Ignore own messages
        if (message.author.id === this.client.user.id) return;
        // Ignore other bots
        if (message.author.bot) return;

        this.stats.received++;

        const isDM = !message.guild;
        const isMentioned = message.mentions.has(this.client.user);

        // In servers: only reply when @mentioned
        if (!isDM && !isMentioned) {
            this.stats.ignored++;
            return;
        }

        // Clean @mention from text
        let text = message.content;
        if (isMentioned) {
            text = text.replace(`<@${this.client.user.id}>`, '').trim();
        }
        if (!text) return;

        const contact = {
            name: message.author.displayName || message.author.username,
            channel: 'Discord',
            isGroup: !isDM,
        };

        console.log(chalk.cyan(`📨 ${contact.name}: "${text.slice(0, 60)}${text.length > 60 ? '...' : ''}"`));

        try {
            const result = await this.pipeline.processMessage({ text, isGroup: !isDM }, contact);

            if (result.action === 'reply' && result.replies.length > 0) {
                // Simulate typing
                await message.channel.sendTyping();
                const typingTime = Math.min(result.replies.join(' ').length * 50, 4000);
                await TimingEngine.sleep(typingTime);

                for (const reply of result.replies) {
                    await message.reply(reply);
                    console.log(chalk.green(`   → "${reply.slice(0, 60)}${reply.length > 60 ? '...' : ''}"`));
                }
                this.stats.replied++;
            } else if (result.action === 'ignore') {
                this.stats.ignored++;
            }
        } catch (err) {
            console.error(chalk.red(`   → Error: ${err.message}`));
        }
    }

    stop() {
        this.client.destroy();
        console.log(chalk.yellow('\n🛑 Discord bot stopped'));
        console.log(chalk.white(`   ${this.stats.received} received, ${this.stats.replied} replied, ${this.stats.ignored} ignored`));
    }
}
