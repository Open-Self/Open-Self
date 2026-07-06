/**
 * `openself share` — Share your clone via web
 */

import chalk from 'chalk';
import { existsSync } from 'fs';
import { createWebServer } from '../web/server.js';

export async function shareCommand(options) {
    console.log('');
    console.log(chalk.bold.cyan('🌐 OpenSelf — Share Your Clone'));
    console.log(chalk.gray('━'.repeat(40)));
    console.log('');

    if (!existsSync('./data/SOUL.md')) {
        console.log(chalk.red('❌ SOUL.md not found. Run `openself feed` first.'));
        return;
    }

    if (options.web) {
        const port = parseInt(options.port) || 3000;
        const { app } = createWebServer({ port, dataDir: './data' });

        app.listen(port, () => {
            console.log(chalk.bold.green('  ✅ Clone is live!'));
            console.log('');
            console.log(
                chalk.white('  🌐 Chat page: ') + chalk.cyan.underline(`http://localhost:${port}`),
            );
            console.log(
                chalk.white('  🔌 API:       ') +
                    chalk.cyan.underline(`http://localhost:${port}/api/chat`),
            );
            console.log('');
            console.log(
                chalk.gray('  Share this link with friends so they can chat with your clone.'),
            );
            console.log(chalk.gray('  Press Ctrl+C to stop.'));
            console.log('');
        });
    } else {
        console.log(chalk.white('  Share your clone with others:'));
        console.log('');
        console.log(
            chalk.cyan('  npx openself share --web') + chalk.gray(' — Launch web chat page'),
        );
        console.log('');
    }
}
