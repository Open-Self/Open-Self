import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { packageVersion } from '../src/version.js';

// Release tags deliberately exclude build metadata: npm does not use it to
// distinguish package versions. Every prerelease goes to the opt-in next channel.
export function releaseChannel(version, tag) {
    const match =
        /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(
            version,
        );
    if (
        !match ||
        match[0] !== version ||
        match[4]?.split('.').some((part) => /^\d+$/.test(part) && /^0\d/.test(part))
    ) {
        throw new Error('Release requires a canonical version without build metadata');
    }
    if (tag !== `v${version}`) throw new Error('Release tag must match package version');
    const prerelease = Boolean(match[4]);
    return { prerelease, npmTag: prerelease ? 'next' : 'latest' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const channel = releaseChannel(packageVersion, process.env.GITHUB_REF_NAME);
    if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required');
    appendFileSync(
        process.env.GITHUB_OUTPUT,
        `prerelease=${channel.prerelease}\nnpm_tag=${channel.npmTag}\n`,
    );
}
