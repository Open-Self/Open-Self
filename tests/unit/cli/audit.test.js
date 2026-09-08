import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { auditCommand } from '../../../src/cli/audit.js';

it('provides owner audit list/prune/clear commands with validated controls', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'openself-audit-cli-'));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
        auditCommand('list', { dataDir });
        expect(JSON.parse(log.mock.calls.at(-1)[0])).toEqual([]);
        for (const action of ['prune', 'clear']) {
            auditCommand(action, { dataDir });
            expect(JSON.parse(log.mock.calls.at(-1)[0])).toEqual({ deleted: 0 });
        }
        expect(() => auditCommand('invalid', { dataDir })).toThrow('Use audit');
    } finally {
        log.mockRestore();
        rmSync(dataDir, { recursive: true, force: true });
    }
});
