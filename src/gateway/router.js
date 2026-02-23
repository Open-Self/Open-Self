/**
 * Gateway Router — Multi-channel message gateway manager
 */

import { TelegramGateway } from './telegram.js';
import { DiscordGateway } from './discord.js';

const GATEWAYS = {
    telegram: TelegramGateway,
    discord: DiscordGateway,
};

export function createGateway(name, config = {}) {
    const GatewayClass = GATEWAYS[name.toLowerCase()];
    if (!GatewayClass) {
        throw new Error(
            `Unknown gateway: "${name}". Available: ${Object.keys(GATEWAYS).join(', ')}`
        );
    }
    return new GatewayClass(config);
}

export function listGateways() {
    return [
        { name: 'telegram', available: true, envVar: 'TELEGRAM_BOT_TOKEN', configured: !!process.env.TELEGRAM_BOT_TOKEN },
        { name: 'discord', available: true, envVar: 'DISCORD_BOT_TOKEN', configured: !!process.env.DISCORD_BOT_TOKEN },
        { name: 'whatsapp', available: false, note: 'Coming soon (Baileys)' },
    ];
}

export { GATEWAYS };
