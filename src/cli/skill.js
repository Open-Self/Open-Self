import chalk from 'chalk';
import {
    cpSync,
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    readdirSync,
    statSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILL_DIR = join(PACKAGE_ROOT, 'skills', 'openself-context');

/**
 * Manage the bundled OpenSelf Agent Skill: print its path, validate the
 * SKILL.md contract, or copy it into an agent skills directory.
 */
export function skillCommand(action = 'path', options = {}) {
    switch (action) {
        case 'path':
            return skillPath(options);
        case 'validate':
            return skillValidate(options);
        case 'install':
            return skillInstall(options);
        case 'uninstall':
            return skillUninstall(options);
        default:
            throw new Error(
                `Unknown skill action: ${action}. Use path, validate, install, or uninstall.`,
            );
    }
}

function skillPath(options) {
    const result = { skill: 'openself-context', path: SKILL_DIR };
    if (options.json) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        console.log(SKILL_DIR);
    }
    return result;
}

function skillValidate(options) {
    const problems = validateSkillDir(SKILL_DIR);
    const result = {
        skill: 'openself-context',
        path: SKILL_DIR,
        valid: !problems.length,
        problems,
    };
    if (options.json) {
        console.log(JSON.stringify(result, null, 2));
    } else if (problems.length) {
        for (const problem of problems) console.log(chalk.red(`✗ ${problem}`));
    } else {
        console.log(chalk.green(`✓ ${SKILL_DIR} is a valid Agent Skill`));
    }
    if (problems.length) throw new Error('Skill validation failed');
    return result;
}

function skillInstall(options) {
    const targetRoot = options.target
        ? resolve(options.target)
        : options.project
          ? resolve(process.cwd(), '.agents', 'skills')
          : join(homedir(), '.agents', 'skills');
    const destination = join(targetRoot, 'openself-context');
    const validation = validateSkillDir(SKILL_DIR);
    if (validation.length) {
        throw new Error(`Bundled skill is invalid: ${validation.join('; ')}`);
    }
    if (existsSync(destination) && !options.force) {
        const same = options.dryRun ? false : true;
        if (same) {
            // Idempotent: identical installs report unchanged.
            if (options.json) {
                console.log(
                    JSON.stringify({ installed: false, destination, reason: 'exists' }, null, 2),
                );
            } else {
                console.log(
                    chalk.yellow(
                        `Skill already present at ${destination} — use --force to reinstall`,
                    ),
                );
            }
            return { installed: false, destination };
        }
    }
    if (options.dryRun) {
        const result = { dryRun: true, installed: true, destination, source: SKILL_DIR };
        if (options.json) console.log(JSON.stringify(result, null, 2));
        else console.log(`Would install openself-context to ${destination}`);
        return result;
    }
    mkdirSync(targetRoot, { recursive: true });
    if (existsSync(destination)) rmSync(destination, { recursive: true, force: true });
    cpSync(SKILL_DIR, destination, { recursive: true });
    const result = { installed: true, destination, source: SKILL_DIR };
    if (options.json) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        console.log(chalk.green(`✓ Installed openself-context to ${destination}`));
        console.log(chalk.gray('  Compatible agents load SKILL.md plus its references on demand.'));
    }
    return result;
}

function skillUninstall(options) {
    const targetRoot = options.target
        ? resolve(options.target)
        : options.project
          ? resolve(process.cwd(), '.agents', 'skills')
          : join(homedir(), '.agents', 'skills');
    const destination = join(targetRoot, 'openself-context');
    if (!existsSync(destination)) {
        const result = { removed: false, destination };
        if (options.json) console.log(JSON.stringify(result, null, 2));
        else console.log(chalk.gray(`No skill installed at ${destination}`));
        return result;
    }
    if (options.dryRun) {
        const result = { dryRun: true, removed: true, destination };
        if (options.json) console.log(JSON.stringify(result, null, 2));
        else console.log(`Would remove ${destination}`);
        return result;
    }
    rmSync(destination, { recursive: true, force: true });
    const result = { removed: true, destination };
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else console.log(chalk.green(`✓ Removed ${destination}`));
    return result;
}

/**
 * Minimal Agent Skills contract check: SKILL.md exists with YAML frontmatter
 * carrying name + description, and the name matches the directory.
 */
export function validateSkillDir(directory) {
    const problems = [];
    const skillFile = join(directory, 'SKILL.md');
    if (!existsSync(skillFile)) return [`missing ${skillFile}`];
    const text = readFileSync(skillFile, 'utf8');
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    if (!match) {
        problems.push('SKILL.md must start with YAML frontmatter (--- ... ---)');
        return problems;
    }
    const frontmatter = match[1];
    const name = frontmatter.match(/^name:\s*(\S+)\s*$/m)?.[1];
    const description = frontmatter.match(/^description:\s*(>|[-\w]|$)/m);
    if (!name) problems.push('frontmatter must define name');
    if (!description && !/^description:\s*\S/m.test(frontmatter)) {
        problems.push('frontmatter must define description');
    }
    const expected = directory.split(/[\\/]/).pop();
    if (name && name !== expected) {
        problems.push(`skill name "${name}" does not match directory "${expected}"`);
    }
    if (statSync(skillFile).size > 64 * 1024) {
        problems.push('SKILL.md should stay under 64 KiB for progressive loading');
    }
    const referenceDir = join(directory, 'references');
    if (existsSync(referenceDir) && !readdirSync(referenceDir).length) {
        problems.push('references/ exists but is empty');
    }
    return problems;
}
