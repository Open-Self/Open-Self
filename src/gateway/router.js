/**
 * Gateway Router
 * Multi-channel message gateway manager
 */

import { TelegramGateway } from './telegram.js';

const GATEWAYS = {
    telegram: TelegramGateway,
};

/**
 * Create and start a messaging gateway
 */
export function createGateway(name, config = {}) {
    const GatewayClass = GATEWAYS[name.toLowerCase()];
    if (!GatewayClass) {
        throw new Error(
            `Unknown gateway: "${name}". Available: ${Object.keys(GATEWAYS).join(', ')}`
        );
    }
    return new GatewayClass(config);
}

/**
 * List available gateways and their status
 */
export function listGateways() {
    return [
        {
            name: 'telegram',
            available: true,
            envVar: 'TELEGRAM_BOT_TOKEN',
            configured: !!process.env.TELEGRAM_BOT_TOKEN,
        },
        {
            name: 'whatsapp',
            available: false,
            note: 'Coming in Week 4 (Baileys)',
        },
        {
            name: 'discord',
            available: false,
            note: 'Coming in Week 4 (discord.js)',
        },
    ];
}

export { GATEWAYS };
