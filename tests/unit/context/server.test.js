import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createContextServer } from '../../../src/context/server.js';
import { ContextStore } from '../../../src/context/store.js';

describe('Context dashboard server', () => {
    let context;
    let store;
    let server;
    let baseUrl;
    let cookie;

    beforeEach(async () => {
        store = new ContextStore({ dbPath: ':memory:' });
        context = createContextServer({ store, token: 'test-dashboard-token' });
        await new Promise((resolve) => {
            server = context.app.listen(0, '127.0.0.1', resolve);
        });
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        const auth = await fetch(`${baseUrl}/auth?token=test-dashboard-token`, {
            redirect: 'manual',
        });
        cookie = auth.headers.get('set-cookie').split(';')[0];
    });

    afterEach(async () => {
        await new Promise((resolve) => server.close(resolve));
        store.close();
    });

    it('requires authentication and bootstraps an HttpOnly session cookie', async () => {
        const unauthorized = await fetch(`${baseUrl}/api/context/stats`);
        const badAuth = await fetch(`${baseUrl}/auth?token=wrong`, { redirect: 'manual' });
        const authorized = await request('/api/context/stats');

        expect(unauthorized.status).toBe(401);
        expect(badAuth.status).toBe(401);
        expect(cookie).toContain('openself_context=');
        expect(authorized.status).toBe(200);
        expect(authorized.headers.get('content-security-policy')).toContain("default-src 'self'");
        expect(authorized.headers.get('cache-control')).toBe('no-store');
    });

    it('creates, searches, updates, versions, and forgets a memory', async () => {
        const createdResponse = await request('/api/context/memories', {
            method: 'POST',
            body: JSON.stringify({
                type: 'decision',
                content: 'Use SQLite for dashboard storage',
                scope: 'project/openself',
            }),
        });
        const created = await createdResponse.json();

        expect(createdResponse.status).toBe(201);
        expect(created.potentialConflicts).toEqual([]);

        const search = await (
            await request('/api/context/memories?q=dashboard&scope=project%2Fopenself')
        ).json();
        expect(search.memories[0].id).toBe(created.memory.id);

        const updated = await (
            await request(`/api/context/memories/${created.memory.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ content: 'Use SQLite for the local dashboard' }),
            })
        ).json();
        expect(updated.memory.content).toContain('local dashboard');
        expect(updated.potentialConflicts).toEqual([]);

        const history = await (
            await request(`/api/context/memories/${created.memory.id}/history`)
        ).json();
        expect(history.history.map((item) => item.changeKind)).toEqual(['updated', 'created']);

        const forgotten = await request(`/api/context/memories/${created.memory.id}`, {
            method: 'DELETE',
        });
        expect(forgotten.status).toBe(200);
        expect((await request(`/api/context/memories/${created.memory.id}`)).status).toBe(404);
    });

    it('merges duplicates and exposes their version history', async () => {
        const primary = store.remember({ content: 'Launch Friday', tags: ['launch'] });
        const duplicate = store.remember({ content: 'Friday launch', tags: ['calendar'] });

        const response = await request(`/api/context/memories/${primary.id}/merge`, {
            method: 'POST',
            body: JSON.stringify({ duplicateIds: [duplicate.id] }),
        });
        const result = await response.json();

        expect(response.status).toBe(200);
        expect(result.memory.tags).toEqual(['launch', 'calendar']);
        expect(store.get(duplicate.id)).toBeNull();
        expect(store.history(duplicate.id)[0].changeKind).toBe(`merged_into:${primary.id}`);

        const invalid = await request(`/api/context/memories/${primary.id}/merge`, {
            method: 'POST',
            body: JSON.stringify({ duplicateIds: [] }),
        });
        expect(invalid.status).toBe(400);
    });

    it('blocks cross-origin mutations', async () => {
        const response = await fetch(`${baseUrl}/api/context/memories`, {
            method: 'POST',
            headers: {
                Cookie: cookie,
                Origin: 'https://attacker.example',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content: 'Injected memory' }),
        });
        expect(response.status).toBe(403);
        expect(store.stats().total).toBe(0);
    });

    it('serves dashboard assets only to an authenticated session', async () => {
        expect((await fetch(`${baseUrl}/`)).status).toBe(401);
        const page = await request('/');
        expect(page.status).toBe(200);
        expect(await page.text()).toContain('Context Vault');
        expect((await request('/dashboard.js')).status).toBe(200);
    });

    function request(path, options = {}) {
        return fetch(`${baseUrl}${path}`, {
            ...options,
            headers: {
                Cookie: cookie,
                Origin: baseUrl,
                ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                ...(options.headers || {}),
            },
        });
    }
});
