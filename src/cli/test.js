/**
 * `openself test` — Clone Score Test
 * Replay real conversations and compare clone replies vs real replies
 */

import chalk from 'chalk';
import ora from 'ora';
import { readFileSync, existsSync } from 'fs';
import { CloneBrain, loadSoul } from '../brain/clone.js';
import { createProvider, autoDetectProvider } from '../brain/router.js';
import { loadConfig } from '../config/loader.js';

export async function testCommand(options) {
    console.log('');
    console.log(chalk.bold.cyan('🧪 OpenSelf — Clone Score Test'));
    console.log(chalk.gray('━'.repeat(40)));
    console.log('');

    // Check prerequisites
    if (!existsSync('./data/SOUL.md')) {
        console.log(chalk.red('❌ SOUL.md not found. Run `openself feed` first.'));
        return;
    }

    if (!existsSync('./data/conversations.json')) {
        console.log(chalk.red('❌ No test conversations found. Run `openself feed` first.'));
        return;
    }

    // Load data
    const config = loadConfig();
    const soulContent = loadSoul('./data');
    const brain = new CloneBrain(soulContent, config);

    // Load test conversations
    const conversations = JSON.parse(readFileSync('./data/conversations.json', 'utf-8'));
    const testCount = Math.min(parseInt(options.count) || 10, conversations.length);

    if (testCount === 0) {
        console.log(chalk.red('❌ No conversations to test with.'));
        return;
    }

    // Create LLM provider
    const providerName = options.provider || config.llm.provider || autoDetectProvider();
    let provider;

    try {
        provider = createProvider(providerName);
        console.log(chalk.white(`  🤖 Provider: ${chalk.cyan(providerName)}`));
    } catch (err) {
        console.log(chalk.red(`❌ Failed to create provider: ${err.message}`));
        console.log(chalk.yellow('   Set your API key in .env or run `openself setup`'));
        return;
    }

    console.log(chalk.white(`  📝 Testing ${chalk.cyan(testCount)} conversations`));
    console.log('');

    // Run tests
    const results = [];
    let totalScore = 0;

    for (let i = 0; i < testCount; i++) {
        const conv = conversations[i];
        const spinner = ora(`Test ${i + 1}/${testCount}: "${truncate(conv.theirMessage, 40)}"`).start();

        try {
            const cloneReply = await brain.generateReply(
                conv.theirMessage,
                { name: conv.contact, relationship: 'friend' },
                provider,
            );

            const score = calculateSimilarity(conv.yourReply, cloneReply);
            totalScore += score;

            const scoreColor = score >= 80 ? chalk.green : score >= 60 ? chalk.yellow : chalk.red;
            const emoji = score >= 80 ? '✅' : score >= 60 ? '🟡' : '❌';

            spinner.succeed(
                `${emoji} ${scoreColor(`${score}%`)} ` +
                chalk.gray(`Q: "${truncate(conv.theirMessage, 30)}"`)
            );
            console.log(chalk.gray(`      Real: "${truncate(conv.yourReply, 50)}"`));
            console.log(chalk.gray(`      Clone: "${truncate(cloneReply, 50)}"`));

            results.push({ question: conv.theirMessage, real: conv.yourReply, clone: cloneReply, score });
        } catch (err) {
            spinner.fail(`Failed: ${err.message}`);
            results.push({ question: conv.theirMessage, error: err.message, score: 0 });
        }
    }

    // Final score
    const avgScore = Math.round(totalScore / testCount);
    const grade = getGrade(avgScore);

    console.log('');
    console.log(chalk.gray('═'.repeat(40)));
    console.log('');
    console.log(chalk.bold.white(`  📊 Overall Clone Score: ${getScoreColor(avgScore)(`${avgScore}%`)} (Grade: ${chalk.bold(grade)})`));
    console.log(chalk.white(`  Your clone is ${chalk.bold.cyan(`${avgScore}%`)} you.`));
    console.log('');

    // Tips
    if (avgScore < 70) {
        console.log(chalk.yellow('  💡 Tips to improve:'));
        console.log(chalk.gray('     • Feed more chat history (more = better)'));
        console.log(chalk.gray('     • Edit data/SOUL.md to fine-tune personality'));
        console.log(chalk.gray('     • Try a different LLM provider'));
    }
    console.log('');
}

/**
 * Simple similarity scoring between real reply and clone reply
 */
function calculateSimilarity(real, clone) {
    if (!real || !clone) return 0;

    const realLower = real.toLowerCase().trim();
    const cloneLower = clone.toLowerCase().trim();

    // Exact match
    if (realLower === cloneLower) return 100;

    let score = 0;

    // 1. Length similarity (30 points)
    const lenRatio = Math.min(realLower.length, cloneLower.length) / Math.max(realLower.length, cloneLower.length);
    score += lenRatio * 30;

    // 2. Word overlap (40 points)
    const realWords = new Set(realLower.split(/\s+/));
    const cloneWords = new Set(cloneLower.split(/\s+/));
    let overlap = 0;
    for (const word of realWords) {
        if (cloneWords.has(word)) overlap++;
    }
    const wordOverlap = overlap / Math.max(realWords.size, 1);
    score += wordOverlap * 40;

    // 3. Sentiment match (15 points)
    const realHasEmoji = /[\u{1F600}-\u{1F9FF}]/u.test(real);
    const cloneHasEmoji = /[\u{1F600}-\u{1F9FF}]/u.test(clone);
    if (realHasEmoji === cloneHasEmoji) score += 15;

    // 4. Tone match (15 points)
    const realFormal = /ạ|dạ|vâng/i.test(real);
    const cloneFormal = /ạ|dạ|vâng/i.test(clone);
    if (realFormal === cloneFormal) score += 15;

    return Math.min(Math.round(score), 100);
}

function getGrade(score) {
    if (score >= 95) return 'A+';
    if (score >= 90) return 'A';
    if (score >= 85) return 'A-';
    if (score >= 80) return 'B+';
    if (score >= 75) return 'B';
    if (score >= 70) return 'B-';
    if (score >= 65) return 'C+';
    if (score >= 60) return 'C';
    return 'D';
}

function getScoreColor(score) {
    if (score >= 80) return chalk.green;
    if (score >= 60) return chalk.yellow;
    return chalk.red;
}

function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.substring(0, len) + '...' : str;
}
