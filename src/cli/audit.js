import { join } from 'node:path';
import { AccessAudit } from '../context/access-audit.js';

export function auditCommand(action, options = {}) {
    if (!['list', 'prune', 'clear'].includes(action))
        throw new Error('Use audit list, prune or clear');
    const audit = new AccessAudit({
        dbPath: join(options.dataDir || process.env.DATA_DIR || './data', 'mcp-audit.db'),
        retentionDays: options.retentionDays,
        maxEntries: options.maxEntries,
    });
    try {
        const result = action === 'list' ? audit.list(options) : { deleted: audit[action]() };
        console.log(JSON.stringify(result, null, 2));
    } finally {
        audit.close();
    }
}
