/**
 * `openself ghost` — Ghost Mode Control
 */

import chalk from 'chalk';
import { GhostMode } from '../ghost/ghost.js';

export async function ghostCommand(args, _options) {
    const ghost = new GhostMode('./data');
    const action = args[0] || 'status';

    console.log('');
    console.log(chalk.bold.white('👻 OpenSelf — Ghost Mode'));
    console.log(chalk.gray('━'.repeat(40)));
    console.log('');

    switch (action) {
        case 'on':
        case 'enable':
            ghost.enable();
            console.log(chalk.green('  ✅ Ghost Mode enabled'));
            console.log(chalk.gray('  Your clone will reply when you\'re offline.'));
            console.log(chalk.gray('  Run `openself ghost off` when you\'re back.'));
            break;

        case 'off':
        case 'disable':
            ghost.disable();
            console.log(chalk.yellow('  🔴 Ghost Mode disabled'));
            console.log(chalk.gray('  Your clone will stop replying.'));
            break;

        case 'ping':
            ghost.ping();
            console.log(chalk.cyan('  📡 Heartbeat sent — you\'re marked as online.'));
            break;

        case 'status':
        default: {
            const status = ghost.getStatus();
            const emoji = status.ghostMode ? '👻' : status.online ? '🟢' : '⚪';

            console.log(chalk.white(`  ${emoji} Status: ${chalk.bold(status.status)}`));
            console.log(chalk.white(`  👻 Ghost Mode: ${status.ghostMode ? chalk.green('ON') : chalk.gray('OFF')}`));
            console.log(chalk.white(`  🟢 Online: ${status.online ? chalk.green('Yes') : chalk.gray('No')}`));
            console.log(chalk.white(`  ⏱️  Last seen: ${chalk.cyan(status.lastSeen)}`));

            if (status.ghostMode && status.isUserOffline) {
                console.log(chalk.green('\n  → Clone is actively replying for you'));
            }
            break;
        }
    }

    console.log('');
}
