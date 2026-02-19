/**
 * `openself feed` — Feed chat history to build personality
 */

import chalk from 'chalk';
import ora from 'ora';
import { parseWhatsApp, splitBySender, detectUserName } from '../parsers/whatsapp.js';
import { parseTelegram } from '../parsers/telegram.js';
import { parseGeneric } from '../parsers/generic.js';
import { extractPersonality } from '../personality/extractor.js';
import { createFingerprint } from '../personality/fingerprint.js';
import { generateSoulMd, saveSoulMd } from '../personality/soul-generator.js';
import inquirer from 'inquirer';

export async function feedCommand(options) {
    console.log('');
    console.log(chalk.bold.cyan('🧠 OpenSelf — Feed Personality'));
    console.log(chalk.gray('━'.repeat(40)));
    console.log('');

    const allMessages = [];
    let userName = options.name || process.env.OPENSELF_USER_NAME || '';
    const contactMap = {};

    // Parse WhatsApp files
    if (options.whatsapp) {
        for (const file of options.whatsapp) {
            const spinner = ora(`Parsing WhatsApp export: ${file}`).start();
            try {
                const messages = parseWhatsApp(file);
                allMessages.push(...messages);
                spinner.succeed(`Parsed ${messages.length} messages from ${file}`);
            } catch (err) {
                spinner.fail(`Failed to parse ${file}: ${err.message}`);
            }
        }
    }

    // Parse Telegram files
    if (options.telegram) {
        for (const file of options.telegram) {
            const spinner = ora(`Parsing Telegram export: ${file}`).start();
            try {
                const messages = parseTelegram(file);
                allMessages.push(...messages);
                spinner.succeed(`Parsed ${messages.length} messages from ${file}`);
            } catch (err) {
                spinner.fail(`Failed to parse ${file}: ${err.message}`);
            }
        }
    }

    // Parse manual personality briefs
    if (options.manual) {
        for (const file of options.manual) {
            const spinner = ora(`Reading personality brief: ${file}`).start();
            try {
                const personality = parseGeneric(file);
                spinner.succeed(`Read personality brief from ${file}`);
                // Manual briefs get saved directly
                console.log(chalk.gray(`  Sections: ${Object.keys(personality.sections).join(', ')}`));
            } catch (err) {
                spinner.fail(`Failed to read ${file}: ${err.message}`);
            }
        }
    }

    if (allMessages.length === 0 && !options.manual) {
        console.log(chalk.red('\n❌ No messages found. Please provide chat export files.'));
        console.log(chalk.yellow('   npx openself feed --whatsapp ./chat-export.txt'));
        return;
    }

    // Detect or ask for user name
    if (!userName && allMessages.length > 0) {
        const detected = detectUserName(allMessages);
        console.log('');
        console.log(chalk.white('Detected senders:'));
        for (const sender of detected.allSenders.slice(0, 5)) {
            console.log(chalk.gray(`  • ${sender.name} (${sender.count} messages)`));
        }

        const { selectedName } = await inquirer.prompt([{
            type: 'list',
            name: 'selectedName',
            message: 'Which one is YOU?',
            choices: detected.allSenders.slice(0, 10).map(s => s.name),
        }]);
        userName = selectedName;
    }

    if (allMessages.length > 0) {
        // Split messages
        const spinnerAnalyze = ora('Analyzing your personality...').start();
        const { yours, others, conversations } = splitBySender(allMessages, userName);

        // Build contact map
        for (const msg of others) {
            if (!contactMap[msg.sender]) {
                contactMap[msg.sender] = { name: msg.sender, messageCount: 0, relationship: 'Contact' };
            }
            contactMap[msg.sender].messageCount++;
        }

        // Extract personality
        const personality = extractPersonality(yours, conversations);
        const fingerprint = createFingerprint(yours.map(m => m.text));

        spinnerAnalyze.succeed('Personality analysis complete');

        // Show summary
        console.log('');
        console.log(chalk.bold.white('📊 Personality Summary'));
        console.log(chalk.gray('━'.repeat(40)));
        console.log(chalk.white(`  📝 Total messages analyzed: ${chalk.cyan(personality.totalMessages)}`));
        console.log(chalk.white(`  📏 Avg message length: ${chalk.cyan(personality.avgMessageLength)} chars`));
        console.log(chalk.white(`  😀 Emoji frequency: ${chalk.cyan(Math.round(personality.emojiFrequency * 100) + '%')}`));
        console.log(chalk.white(`  🗣️  Formality: ${chalk.cyan(personality.formality)}`));
        console.log(chalk.white(`  🌍 Language: ${chalk.cyan(personality.primaryLanguage)}`));
        console.log(chalk.white(`  😂 Humor: ${chalk.cyan(personality.humorPatterns.join(', '))}`));
        console.log(chalk.white(`  👋 Greeting style: ${chalk.cyan(personality.greetingStyle)}`));

        if (personality.catchphrases.length > 0) {
            console.log(chalk.white(`  💬 Catchphrases: ${chalk.cyan(personality.catchphrases.slice(0, 5).join(', '))}`));
        }
        if (personality.abbreviations.length > 0) {
            console.log(chalk.white(`  ✂️  Abbreviations: ${chalk.cyan(personality.abbreviations.slice(0, 5).join(', '))}`));
        }
        if (personality.pronounUsage.length > 0) {
            console.log(chalk.white(`  🇻🇳 Pronouns: ${chalk.cyan(personality.pronounUsage.join(', '))}`));
        }

        // Generate SOUL.md
        console.log('');
        const spinnerSoul = ora('Generating SOUL.md...').start();
        const soulContent = generateSoulMd(personality, fingerprint, {
            name: userName,
            contacts: contactMap,
        });
        const soulPath = saveSoulMd(soulContent);
        spinnerSoul.succeed(`SOUL.md generated at ${chalk.cyan(soulPath)}`);

        // Save conversations for clone testing
        const conversationsForTest = conversations.slice(0, 100); // Keep top 100
        const { writeFileSync, mkdirSync, existsSync } = await import('fs');
        const dataDir = './data';
        if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
        writeFileSync(
            `${dataDir}/conversations.json`,
            JSON.stringify(conversationsForTest, null, 2),
            'utf-8',
        );

        console.log('');
        console.log(chalk.bold.green('🎉 Personality fed successfully!'));
        console.log('');
        console.log(chalk.white('Next:'));
        console.log(chalk.yellow('  npx openself test       ') + chalk.gray('— Test how well your clone mimics you'));
        console.log(chalk.yellow('  cat data/SOUL.md        ') + chalk.gray('— Review/edit your personality profile'));
        console.log('');
    }
}
