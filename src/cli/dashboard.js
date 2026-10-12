import chalk from 'chalk';
import { createContextServer } from '../context/server.js';

export async function dashboardCommand(options = {}) {
    const context = createContextServer({
        dataDir: options.dataDir || process.env.DATA_DIR || './data',
        port: Number(options.port || 3210),
        host: '127.0.0.1',
    });
    const server = context.app.listen(context.port, context.host, () => {
        const url = `http://${context.host}:${context.port}/auth?token=${encodeURIComponent(context.token)}`;
        console.log(chalk.bold.green('OpenSelf Context Dashboard is running locally'));
        console.log(chalk.cyan.underline(url));
        console.log(
            chalk.gray('The one-time URL sets a local session cookie. Press Ctrl+C to stop.'),
        );
    });

    const stop = () => {
        server.close(() => {
            context.close();
            process.exit(0);
        });
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
}
