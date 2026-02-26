/**
 * Gateway Router — Multi-channel message gateway manager
 */

import { TelegramGateway } from './telegram.js';
import { DiscordGateway } from './discord.js';
import { WhatsAppGateway } from './whatsapp.js';

const GATEWAYS = {
    telegram: TelegramGateway,
    discord: DiscordGateway,
    whatsapp: WhatsAppGateway,
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
        { name: 'whatsapp', available: true, envVar: null, configured: true, note: 'QR code pairing (no API key needed)' },
    ];
}

export { GATEWAYS };

