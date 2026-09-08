import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import Database from 'better-sqlite3';
import * as api from 'openself';

const require = createRequire(import.meta.url);
assert.deepEqual(
    Object.keys(api).sort(),
    JSON.parse(readFileSync('expected-exports.json', 'utf8')),
);
const pkg = require('openself/package.json');
const version = execFileSync(process.execPath, [require.resolve('openself/cli'), '--version'], {
    encoding: 'utf8',
    windowsHide: true,
}).trim();
assert.equal(version, pkg.version);

for (const released of ['v0.9.1', 'v0.11.0']) {
    const db = new Database(`${released}.db`);
    db.exec(readFileSync(`${released}.sql`, 'utf8'));
    db.close();
    const store = new api.ContextStore({ dbPath: `${released}.db` });
    try {
        const id = '00000000-0000-4000-8000-000000000001';
        assert.equal(store.search('SQLite decision')[0].id, id);
        assert.equal(store.history(id).length, 2);
        assert.equal(store.history(id)[1].snapshot.content, 'Original fixture decision');
        assert.equal(store.get('00000000-0000-4000-8000-000000000002'), null);
        assert.equal(
            store.rememberOnce({ content: 'must not duplicate' }, 'fixture-dedupe-key').created,
            false,
        );
        assert.equal(store.stats().total, 2);
        assert.equal(store.db.pragma('user_version', { simple: true }), 2);
        assert.equal(
            store.db.prepare('SELECT COUNT(*) AS count FROM capture_checkpoints').get().count,
            0,
        );
    } finally {
        store.close();
    }
}

const store = new api.ContextStore({ dbPath: ':memory:' });
let mcp;
let client;
let http;
try {
    const remembered = store.remember({
        content: 'Installed package database decision',
        scope: 'project/fixture',
        sensitivity: 'public',
    });
    store.remember({
        content: 'Hidden database decision',
        scope: 'personal',
        sensitivity: 'restricted',
    });
    mcp = api.createContextMcpServer(store, {
        policy: {
            clientId: 'fixture',
            scopes: ['project/fixture'],
            maxSensitivity: 'public',
            capabilities: ['read'],
        },
    });
    client = new Client({ name: 'installed-client', version: '1' });
    const [left, right] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(left), mcp.connect(right)]);
    const result = await client.callTool({
        name: 'openself_search_memory',
        arguments: { query: 'database', maxSensitivity: 'restricted' },
    });
    assert.deepEqual(
        JSON.parse(result.content[0].text).memories.map((memory) => memory.id),
        [remembered.id],
    );
    const temporal = store.remember({
        content: 'Temporal offset fixture',
        scope: 'project/fixture',
        sensitivity: 'public',
        validFrom: '2026-01-01T15:00:00+07:00',
        validTo: '2026-01-01T04:00:00-05:00',
    });
    const temporalResult = await client.callTool({
        name: 'openself_search_memory',
        arguments: { query: 'Temporal', retrieval: 'lexical', asOf: '2026-01-01T08:00:00Z' },
    });
    assert.deepEqual(
        JSON.parse(temporalResult.content[0].text).memories.map((memory) => memory.id),
        [temporal.id],
    );
    store.remember({
        content: 'Large database decision '.repeat(100),
        scope: 'project/fixture',
        sensitivity: 'public',
        occurredAt: '2099-01-01T00:00:00.000Z',
    });
    const contextResult = await client.callTool({
        name: 'openself_get_context',
        arguments: { query: '!!!', maxChars: 500, maxSensitivity: 'restricted' },
    });
    assert.equal(contextResult.isError, undefined);
    const block = JSON.parse(contextResult.content[0].text);
    assert.deepEqual(
        block.memories.map((memory) => memory.id),
        [remembered.id],
    );
    assert.equal(block.usedChars, block.context.length);
    assert.ok(block.usedChars <= 500);
    assert.ok(block.context.includes(remembered.content));
    const dashboard = api.createContextServer({ store });
    await new Promise((resolve) => {
        http = dashboard.app.listen(0, '127.0.0.1', resolve);
    });
    const origin = `http://127.0.0.1:${http.address().port}`;
    assert.equal((await fetch(origin)).status, 401);
    const response = await fetch(`${origin}/dashboard.js`, {
        headers: { Authorization: `Bearer ${dashboard.token}` },
    });
    assert.equal(response.status, 200);
    assert.ok((await response.text()).includes('/api/context'));
    mkdirSync('capture-source');
    writeFileSync('capture-source/notes.md', 'Installed capture recovery fixture');
    assert.equal(new api.ProjectFolderCapture(store, 'capture-source').scan().added, 1);
    await api.backupVault(store, 'fixture.osbackup', {
        passphrase: 'synthetic recovery passphrase',
    });
    const keys = new Map();
    const backend = {
        provider: 'fixture',
        store: (id, key) => {
            keys.set(id, key);
        },
        load: (id) => keys.get(id),
    };
    await api.restoreVault('fixture.osbackup', 'restored', {
        passphrase: 'synthetic recovery passphrase',
        keyBackend: backend,
    });
    const restored = new api.ContextStore({
        dataDir: 'restored',
        encryptionKey: new api.VaultKeyManager('restored', { backend }).loadKey(),
    });
    try {
        assert.equal(restored.get(remembered.id).content, remembered.content);
        assert.equal(new api.ProjectFolderCapture(restored, 'capture-source').scan().unchanged, 1);
    } finally {
        restored.close();
    }
} finally {
    if (http) await new Promise((resolve) => http.close(resolve));
    await client?.close();
    await mcp?.close();
    store.close();
}
