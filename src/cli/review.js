/**
 * `openself review` — Review Dashboard
 * Show daily report of clone activity and review queue
 */

import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { ReviewQueue } from '../safety/review-queue.js';
import { soulExists } from '../config/soul.js';

export async function reviewCommand() {
    console.log('');
    console.log(chalk.bold.cyan('📊 OpenSelf — Review Dashboard'));
    console.log(chalk.gray('━'.repeat(40)));
    console.log('');

    // Check if setup is done
    if (!soulExists('./data')) {
        console.log(chalk.yellow('⚠️  No SOUL.md found. Run `openself feed` first.'));
        console.log('');
        return;
    }

    // Show SOUL.md summary
    console.log(chalk.bold.white('🧠 Personality Profile'));
    console.log(chalk.gray('─'.repeat(30)));
    try {
        const soul = readFileSync('./data/SOUL.md', 'utf-8');
        const nameMatch = soul.match(/- Name:\s*(.+)/);
        const langMatch = soul.match(/- Language:\s*(.+)/);
        const totalMatch = soul.match(/- Total messages analyzed:\s*(.+)/);

        if (nameMatch) console.log(chalk.white(`  Name: ${chalk.cyan(nameMatch[1])}`));
        if (langMatch) console.log(chalk.white(`  Language: ${chalk.cyan(langMatch[1])}`));
        if (totalMatch) console.log(chalk.white(`  Messages analyzed: ${chalk.cyan(totalMatch[1])}`));
    } catch {
        console.log(chalk.gray('  Could not read SOUL.md'));
    }

    console.log('');

    // Review queue
    const queue = new ReviewQueue('./data');
    const stats = queue.getStats();

    console.log(chalk.bold.white('📋 Review Queue'));
    console.log(chalk.gray('─'.repeat(30)));
    console.log(chalk.white(`  Pending:  ${chalk.yellow(stats.pending)}`));
    console.log(chalk.white(`  Approved: ${chalk.green(stats.approved)}`));
    console.log(chalk.white(`  Rejected: ${chalk.red(stats.rejected)}`));
    console.log(chalk.white(`  Total:    ${chalk.cyan(stats.total)}`));

    // Show pending items
    const pending = queue.getPending();
    if (pending.length > 0) {
        console.log('');
        console.log(chalk.bold.yellow('⚠️  Needs your attention:'));
        for (const item of pending.slice(0, 5)) {
            console.log('');
            console.log(chalk.gray(`  [${item.timestamp}]`));
            console.log(chalk.white(`  From: ${chalk.cyan(item.contact || 'Unknown')}`));
            console.log(chalk.gray(`  Message: "${item.message || ''}"`));
            console.log(chalk.gray(`  Clone reply: "${item.reply || ''}"`));
            console.log(chalk.gray(`  Issue: ${item.issues?.map(i => i.type).join(', ') || 'unknown'}`));
        }
    }

    console.log('');
    console.log(chalk.gray('💡 Use `openself feed` to improve clone accuracy'));
    console.log(chalk.gray('   Edit data/SOUL.md to fine-tune personality'));
    console.log('');
}
