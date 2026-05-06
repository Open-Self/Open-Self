/**
 * Fixture loader — reads files from `tests/fixtures/` regardless of the
 * test file's depth. Avoids brittle relative paths inside test cases.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

export function readFixture(name) {
    return readFileSync(join(FIXTURES_DIR, name), 'utf-8');
}

export function fixturePath(name) {
    return join(FIXTURES_DIR, name);
}
