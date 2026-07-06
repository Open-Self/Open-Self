/**
 * `openself setup` — Interactive Setup Wizard
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import { writeFileSync, existsSync } from 'fs';

export async function setupCommand() {
    console.log('');
    console.log(chalk.bold.cyan('🧑 OpenSelf Setup Wizard'));
    console.log(chalk.gray('━'.repeat(40)));
    console.log('');

    const answers = await inquirer.prompt([
        {
            type: 'list',
            name: 'provider',
            message: 'Which LLM provider do you want to use?',
            choices: [
                { name: '🟠 Anthropic Claude (recommended)', value: 'anthropic' },
                { name: '🟢 OpenAI GPT', value: 'openai' },
                { name: '🔵 DeepSeek (cheapest)', value: 'deepseek' },
                { name: '⚪ Ollama (free, local)', value: 'ollama' },
            ],
        },
        {
            type: 'input',
            name: 'apiKey',
            message: (answers) => {
                if (answers.provider === 'ollama')
                    return 'Ollama base URL (default: http://localhost:11434):';
                return `${answers.provider.charAt(0).toUpperCase() + answers.provider.slice(1)} API key:`;
            },
            validate: (input, answers) => {
                if (answers.provider === 'ollama') return true; // Optional
                if (!input.trim()) return 'API key is required';
                return true;
            },
        },
        {
            type: 'input',
            name: 'name',
            message: "What's your name? (used to identify your messages in chat exports)",
            validate: (input) => (input.trim() ? true : 'Name is required'),
        },
    ]);

    // Generate .env file
    const envContent = generateEnv(answers);
    const envPath = '.env';

    if (existsSync(envPath)) {
        const { overwrite } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'overwrite',
                message: '.env file already exists. Overwrite?',
                default: false,
            },
        ]);
        if (!overwrite) {
            console.log(chalk.yellow('\n⚠️  Skipped .env file'));
        } else {
            writeFileSync(envPath, envContent);
            console.log(chalk.green('\n✅ .env file updated'));
        }
    } else {
        writeFileSync(envPath, envContent);
        console.log(chalk.green('\n✅ .env file created'));
    }

    console.log('');
    console.log(chalk.bold.green('🎉 Setup complete!'));
    console.log('');
    console.log(chalk.white('Next steps:'));
    console.log(chalk.cyan('  1. Export your WhatsApp chat history'));
    console.log(chalk.cyan('     WhatsApp → Settings → Chats → Export Chat'));
    console.log(chalk.cyan('  2. Feed it to OpenSelf:'));
    console.log(
        chalk.yellow(
            `     npx openself feed --whatsapp ./chat-export.txt --name "${answers.name}"`,
        ),
    );
    console.log(chalk.cyan('  3. Test your clone:'));
    console.log(chalk.yellow('     npx openself test'));
    console.log('');
}

function generateEnv(answers) {
    const lines = [
        '# OpenSelf Configuration',
        `# Generated: ${new Date().toISOString()}`,
        '',
        `LLM_PROVIDER=${answers.provider}`,
        '',
    ];

    switch (answers.provider) {
        case 'anthropic':
            lines.push(`ANTHROPIC_API_KEY=${answers.apiKey}`);
            lines.push('LLM_MODEL=claude-sonnet-4-20250514');
            break;
        case 'openai':
            lines.push(`OPENAI_API_KEY=${answers.apiKey}`);
            lines.push('LLM_MODEL=gpt-4o-mini');
            break;
        case 'deepseek':
            lines.push(`DEEPSEEK_API_KEY=${answers.apiKey}`);
            lines.push('LLM_MODEL=deepseek-chat');
            break;
        case 'ollama':
            lines.push(`OLLAMA_BASE_URL=${answers.apiKey || 'http://localhost:11434'}`);
            lines.push('LLM_MODEL=llama3.2');
            break;
    }

    lines.push('');
    lines.push(`OPENSELF_USER_NAME=${answers.name}`);
    lines.push('');

    return lines.join('\n');
}
