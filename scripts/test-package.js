import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temporary = mkdtempSync(join(tmpdir(), 'openself-package-test-'));
const npmPath = process.env.npm_execpath;
if (!npmPath) throw new Error('Run this check through npm run test:package');
const env = { ...process.env, CI: 'true' };
delete env.OPENSELF_VAULT_KEY;
delete env.DATA_DIR;

function run(command, args, cwd, capture = false) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd,
            env,
            windowsHide: true,
            stdio: ['ignore', capture ? 'pipe' : 'inherit', 'inherit'],
        });
        let output = '';
        if (capture)
            child.stdout.on('data', (chunk) => {
                output += chunk;
            });
        child.on('error', reject);
        child.on('close', (code) =>
            code === 0 ? resolve(output) : reject(new Error(`${command} exited with ${code}`)),
        );
    });
}

try {
    const [archive] = JSON.parse(
        await run(
            process.execPath,
            [npmPath, 'pack', '--ignore-scripts', '--json', '--pack-destination', temporary],
            root,
            true,
        ),
    );
    if (
        archive.files.some(({ path }) =>
            /(^|\/)(data|coverage|node_modules|\.env)(\/|$)|\.(db|dpapi|osbackup)$/.test(path),
        )
    )
        throw new Error('Private/generated runtime file in package');
    const consumer = join(temporary, 'consumer');
    mkdirSync(consumer);
    writeFileSync(
        join(consumer, 'package.json'),
        JSON.stringify({ name: 'openself-consumer-test', private: true, type: 'module' }),
    );
    console.log('Installing packed artifact into an isolated consumer...');
    await run(
        process.execPath,
        [
            npmPath,
            'install',
            '--omit=dev',
            '--no-audit',
            '--no-fund',
            '--package-lock=false',
            join(temporary, archive.filename),
        ],
        consumer,
    );
    for (const file of ['consumer.ts', 'exports.ts'])
        copyFileSync(join(root, 'tests', 'contracts', file), join(consumer, file));
    const config = JSON.parse(readFileSync(join(root, 'tsconfig.types.json'), 'utf8'));
    config.include = ['*.ts'];
    writeFileSync(join(consumer, 'tsconfig.json'), JSON.stringify(config));
    const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
    await run(process.execPath, [tsc, '-p', 'tsconfig.json'], consumer);
    await run(
        process.execPath,
        [tsc, '-p', 'tsconfig.json', '--module', 'ESNext', '--moduleResolution', 'Bundler'],
        consumer,
    );
    copyFileSync(join(root, 'tests', 'package', 'smoke.mjs'), join(consumer, 'smoke.mjs'));
    for (const version of ['v0.9.1', 'v0.11.0'])
        copyFileSync(
            join(root, 'tests', 'fixtures', 'migrations', `${version}.sql`),
            join(consumer, `${version}.sql`),
        );
    writeFileSync(
        join(consumer, 'expected-exports.json'),
        JSON.stringify(Object.keys(await import('../src/index.js')).sort()),
    );
    await run(process.execPath, ['smoke.mjs'], consumer);
    console.log(
        'PASS: isolated package install, NodeNext/Bundler types, runtime API, migration, MCP, dashboard and CLI',
    );
} finally {
    rmSync(temporary, { recursive: true, force: true, maxRetries: 3 });
}
