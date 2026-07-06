/**
 * `openself profile` — Export/Import personality profiles
 * Share SOUL.md bundles with friends for Clone Arena
 */

import chalk from 'chalk';
import ora from 'ora';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export async function profileCommand(action, options) {
    console.log('');
    console.log(chalk.bold.white('👤 OpenSelf — Profile Manager'));
    console.log(chalk.gray('━'.repeat(40)));
    console.log('');

    switch (action) {
        case 'export':
            return exportProfile(options);
        case 'import':
            return importProfile(options);
        case 'info':
        default:
            return showProfileInfo();
    }
}

/**
 * Export SOUL.md + metadata into a shareable .openself JSON file
 */
async function exportProfile(options) {
    const dataDir = './data';

    if (!existsSync(join(dataDir, 'SOUL.md'))) {
        console.log(chalk.red('  ❌ SOUL.md not found. Run `openself feed` first.'));
        return;
    }

    const spinner = ora('Bundling profile...').start();

    const soul = readFileSync(join(dataDir, 'SOUL.md'), 'utf-8');

    // Extract name from SOUL.md
    const nameMatch = soul.match(/- Name:\s*(.+)/);
    const name = nameMatch?.[1]?.trim() || 'clone';
    const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const profile = {
        version: '1.0',
        format: 'openself-profile',
        exportedAt: new Date().toISOString(),
        name,
        soul,
    };

    // Include config if exists
    const configPath = join(dataDir, 'config.yml');
    if (existsSync(configPath)) {
        profile.config = readFileSync(configPath, 'utf-8');
    }

    const outputDir = options.output || '.';
    const filename = `${safeName}.openself`;
    const filepath = join(outputDir, filename);

    writeFileSync(filepath, JSON.stringify(profile, null, 2), 'utf-8');
    spinner.succeed(`Profile exported: ${chalk.cyan(filepath)}`);

    console.log('');
    console.log(chalk.gray('  Share this file with friends for Clone Arena!'));
    console.log(chalk.yellow(`  npx openself arena --soul2 ${filepath}`));
    console.log('');
}

/**
 * Import a .openself profile for use in Arena or as a backup
 */
async function importProfile(options) {
    const file = options.file;

    if (!file) {
        console.log(chalk.red('  ❌ Specify a .openself file to import.'));
        console.log(chalk.gray('  Usage: openself profile import --file friend.openself'));
        return;
    }

    if (!existsSync(file)) {
        console.log(chalk.red(`  ❌ File not found: ${file}`));
        return;
    }

    const spinner = ora('Importing profile...').start();

    try {
        const raw = readFileSync(file, 'utf-8');
        const profile = JSON.parse(raw);

        if (profile.format !== 'openself-profile') {
            spinner.fail('Invalid file format — not an OpenSelf profile');
            return;
        }

        // Sanitize: imported soul flows directly into LLM system prompt,
        // so it's a prompt-injection vector. Strip code fences (common
        // hiding place for jailbreak instructions) and length-cap.
        if (typeof profile.soul !== 'string') {
            spinner.fail('Invalid profile: missing soul content');
            return;
        }
        const MAX_SOUL_BYTES = 50_000;
        if (profile.soul.length > MAX_SOUL_BYTES) {
            spinner.fail(
                `Profile soul too large (${profile.soul.length} > ${MAX_SOUL_BYTES} chars)`,
            );
            return;
        }
        const cleanSoul = profile.soul.replace(/```[a-z0-9]*\n?|```/gi, '');

        // Save to data/profiles/<name>/SOUL.md
        const profilesDir = './data/profiles';
        const safeName =
            (profile.name || 'imported')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .slice(0, 64) || 'imported';
        const targetDir = join(profilesDir, safeName);

        if (!existsSync(targetDir)) {
            mkdirSync(targetDir, { recursive: true });
        }

        writeFileSync(join(targetDir, 'SOUL.md'), cleanSoul, 'utf-8');

        if (profile.config) {
            writeFileSync(join(targetDir, 'config.yml'), profile.config, 'utf-8');
        }

        spinner.succeed(`Imported ${chalk.cyan(profile.name)}'s profile`);
        console.log(chalk.yellow('  ⚠️  Imported content will be loaded into LLM system prompt.'));
        console.log(chalk.yellow('     Only import profiles from trusted sources.'));

        console.log('');
        console.log(chalk.white(`  📁 Saved to: ${chalk.cyan(targetDir)}`));
        console.log(chalk.gray(`  Exported: ${profile.exportedAt}`));
        console.log('');
        console.log(chalk.gray('  Use in Arena:'));
        console.log(chalk.yellow(`  npx openself arena --soul2 ${join(targetDir, 'SOUL.md')}`));
        console.log('');
    } catch (err) {
        spinner.fail(`Import failed: ${err.message}`);
    }
}

/**
 * Show current profile info
 */
async function showProfileInfo() {
    const soulPath = './data/SOUL.md';

    if (!existsSync(soulPath)) {
        console.log(chalk.gray('  No profile found. Run `openself feed` to create one.'));
        console.log('');
        return;
    }

    const soul = readFileSync(soulPath, 'utf-8');
    const nameMatch = soul.match(/- Name:\s*(.+)/);
    const langMatch = soul.match(/- Language:\s*(.+)/);
    const scoreMatch = soul.match(/Clone Score:\s*(\d+)/);

    console.log(chalk.white(`  👤 Name: ${chalk.cyan(nameMatch?.[1]?.trim() || 'Unknown')}`));
    console.log(chalk.white(`  🌍 Language: ${chalk.cyan(langMatch?.[1]?.trim() || 'Unknown')}`));

    if (scoreMatch) {
        console.log(chalk.white(`  📊 Clone Score: ${chalk.cyan(scoreMatch[1] + '%')}`));
    }

    // Check for imported profiles
    const profilesDir = './data/profiles';
    if (existsSync(profilesDir)) {
        const { readdirSync } = await import('fs');
        const profiles = readdirSync(profilesDir, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name);

        if (profiles.length > 0) {
            console.log('');
            console.log(chalk.white(`  👥 Imported profiles: ${chalk.cyan(profiles.join(', '))}`));
        }
    }

    console.log('');
    console.log(chalk.gray('  Commands:'));
    console.log(chalk.yellow('    openself profile export  ') + chalk.gray('— Bundle for sharing'));
    console.log(
        chalk.yellow('    openself profile import  ') + chalk.gray("— Import a friend's profile"),
    );
    console.log('');
}
