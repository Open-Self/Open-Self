/**
 * `openself arena` — Clone vs Clone Debate
 */

import chalk from 'chalk';
import ora from 'ora';
import { existsSync } from 'fs';
import { CloneArena } from '../arena/arena.js';

// Default sparring partner SOUL.md
const DEFAULT_OPPONENT = `# SOUL.md — Default Arena Opponent

## Identity
- Name: Rival
- Language: English

## Communication Patterns
- Average message length: 30 chars
- Emoji frequency: Moderate
- Formality: casual
- Humor: sarcastic

## Vocabulary Fingerprint
- Catchphrases: "hmm", "nah", "hard disagree"
- Capitalization: lowercase

## Boundaries
- Never share: nothing sensitive
- Deflect topics: none
- When unsure: just say something funny
`;

export async function arenaCommand(options) {
    console.log('');
    console.log(chalk.bold.magenta('🏟️  OpenSelf — Clone Arena'));
    console.log(chalk.gray('━'.repeat(40)));
    console.log('');

    if (!existsSync('./data/SOUL.md')) {
        console.log(chalk.red('❌ SOUL.md not found. Run `openself feed` first.'));
        return;
    }

    const topic = options.topic || 'Coffee or bubble tea?';
    const rounds = parseInt(options.rounds) || 5;

    console.log(chalk.white(`  💬 Topic: ${chalk.cyan(`"${topic}"`)}`));
    console.log(chalk.white(`  🔄 Rounds: ${chalk.cyan(rounds)}`));
    console.log('');

    const arena = new CloneArena({ rounds, provider: options.provider });

    // Load clones
    const clone1 = arena.loadClone('./data/SOUL.md');
    let clone2;

    if (options.soul2 && existsSync(options.soul2)) {
        clone2 = arena.loadClone(options.soul2);
    } else {
        // Use default opponent
        clone2 = {
            name: options.name2 || 'Rival',
            brain: new (await import('../brain/clone.js')).CloneBrain(DEFAULT_OPPONENT),
            soulContent: DEFAULT_OPPONENT,
        };
    }

    console.log(chalk.bold(`  🤖 ${chalk.cyan(clone1.name)} vs ${chalk.yellow(clone2.name)}`));
    console.log(chalk.gray('─'.repeat(40)));
    console.log('');

    // Run debate with live output
    const spinner = ora('Clones are preparing...').start();
    let messageCount = 0;

    try {
        const result = await arena.runDebate(clone1, clone2, topic, {
            onMessage: (speaker, text, _idx) => {
                messageCount++;
                if (messageCount === 1) spinner.stop();

                const isClone1 = speaker === clone1.name;
                const nameColor = isClone1 ? chalk.cyan : chalk.yellow;
                const emoji = isClone1 ? '🔵' : '🟡';

                console.log(`  ${emoji} ${nameColor.bold(speaker)}: ${text}`);
                console.log('');
            },
        });

        spinner.stop();

        // Export if requested
        if (options.export) {
            const filepath = arena.exportTranscript(result);
            console.log(chalk.gray(`  📄 Transcript saved: ${chalk.cyan(filepath)}`));
        }

        console.log(chalk.gray('═'.repeat(40)));
        console.log('');
        console.log(
            chalk.bold.magenta(
                `  🏟️  Arena complete! ${result.transcript.length} messages exchanged.`,
            ),
        );

        if (!options.export) {
            console.log(chalk.gray(`  💡 Add --export to save the transcript`));
        }
    } catch (err) {
        spinner.fail(`Arena error: ${err.message}`);
        console.log(chalk.yellow('   Check your API key in .env'));
    }

    console.log('');
}
