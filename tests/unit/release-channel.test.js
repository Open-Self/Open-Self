import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { releaseChannel } from '../../scripts/release-channel.js';
import { packageVersion } from '../../src/version.js';

describe('release channels', () => {
    it.each(['0.13.2', '1.0.0', '2.10.3'])('publishes %s to latest', (version) => {
        expect(releaseChannel(version, `v${version}`)).toEqual({
            prerelease: false,
            npmTag: 'latest',
        });
    });

    it.each(['1.0.0-rc.1', '1.0.0-beta.0', '2.0.0-alpha-preview.12'])(
        'keeps %s out of stable channels',
        (version) => {
            expect(releaseChannel(version, `v${version}`)).toEqual({
                prerelease: true,
                npmTag: 'next',
            });
        },
    );

    it.each(['1.0', '01.0.0', '1.0.0-rc.01', '1.0.0-', '1.0.0+build.1', '1.0.0\n'])(
        'rejects unsupported release version %j',
        (version) => {
            expect(() => releaseChannel(version, `v${version}`)).toThrow();
        },
    );

    it.each(['v1.0.0', '1.0.0-rc.1', undefined])('rejects mismatched tag %s', (tag) => {
        expect(() => releaseChannel('1.0.0-rc.1', tag)).toThrow('match');
    });

    it('writes Actions outputs only after verifying the actual package tag', () => {
        const directory = mkdtempSync(join(tmpdir(), 'openself-release-channel-'));
        const output = join(directory, 'output');
        const script = fileURLToPath(new URL('../../scripts/release-channel.js', import.meta.url));
        const run = (tag) =>
            spawnSync(process.execPath, [script], {
                env: { ...process.env, GITHUB_REF_NAME: tag, GITHUB_OUTPUT: output },
                encoding: 'utf8',
                windowsHide: true,
            });
        try {
            expect(run(`v${packageVersion}`).status).toBe(0);
            const channel = releaseChannel(packageVersion, `v${packageVersion}`);
            const expected = `prerelease=${channel.prerelease}\nnpm_tag=${channel.npmTag}\n`;
            expect(readFileSync(output, 'utf8')).toBe(expected);
            expect(run('v0.0.0-invalid').status).not.toBe(0);
            expect(readFileSync(output, 'utf8')).toBe(expected);
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });
});
