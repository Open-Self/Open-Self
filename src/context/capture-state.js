import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Checkpoints and memories share one SQLite transaction. JSON is legacy input only.
export class CaptureState {
    constructor(store, identity, legacyPath) {
        this.store = store;
        this.key = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
        this.legacyPath = resolve(legacyPath);
    }

    load() {
        const row = this.store.db
            .prepare('SELECT snapshot FROM capture_checkpoints WHERE checkpoint_key = ?')
            .get(this.key);
        const raw = row
            ? this.store.codec.decode(row.snapshot, 'capture-state')
            : existsSync(this.legacyPath)
              ? readFileSync(this.legacyPath, 'utf8')
              : null;
        if (raw === null) return null;
        const state = JSON.parse(raw);
        if (!state || typeof state !== 'object' || Array.isArray(state))
            throw new Error('Invalid capture checkpoint');
        return state;
    }

    save(state) {
        this.store.db
            .prepare(
                'INSERT OR REPLACE INTO capture_checkpoints (checkpoint_key, snapshot) VALUES (?, ?)',
            )
            .run(this.key, this.store.codec.encode(JSON.stringify(state), 'capture-state'));
    }
}
