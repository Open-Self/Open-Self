import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createContextServer } from '../../../src/context/server.js';
import { ContextStore } from '../../../src/context/store.js';

describe('Local app Codex controls', () => {
    let context, server, store, url, cookie, bridge;
    beforeEach(async () => {
        store = new ContextStore({ dbPath: ':memory:' });
        bridge = {
            getStatus: vi.fn(() => ({ status: 'disconnected' })),
            refresh: vi.fn(async () => ({ status: 'disconnected' })),
            login: vi.fn(async () => ({
                status: 'pending',
                authUrl: 'https://auth.openai.com/authorize?state=synthetic',
            })),
            cancel: vi.fn(async () => ({ status: 'disconnected' })),
            logout: vi.fn(async () => ({ status: 'disconnected' })),
            close: vi.fn(),
        };
        context = createContextServer({
            store,
            codexBridge: bridge,
            token: 'synthetic-app-test',
            appMode: true,
        });
        await new Promise((resolve) => {
            server = context.app.listen(0, '127.0.0.1', resolve);
        });
        url = `http://127.0.0.1:${server.address().port}`;
        const auth = await fetch(`${url}/auth?token=synthetic-app-test`, { redirect: 'manual' });
        cookie = auth.headers.get('set-cookie').split(';')[0];
        expect(auth.headers.get('location')).toBe('/#home');
    });
    afterEach(async () => {
        server.closeAllConnections?.();
        await new Promise((resolve) => server.close(resolve));
        context.close();
        store.close();
    });
    async function post(action, body = {}, origin = url) {
        return fetch(`${url}/api/context/codex/${action}`, {
            method: 'POST',
            headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    }
    it('protects status and never starts a process on a status read', async () => {
        expect((await fetch(`${url}/api/context/codex`)).status).toBe(401);
        const response = await fetch(`${url}/api/context/codex`, { headers: { Cookie: cookie } });
        expect(await response.json()).toEqual({ status: 'disconnected' });
        expect(bridge.refresh).not.toHaveBeenCalled();
        expect(response.headers.get('cache-control')).toBe('no-store');
    });
    it('requires explicit consent and exact same origin including port', async () => {
        expect((await post('login')).status).toBe(400);
        expect((await post('login', { consent: true }, 'http://127.0.0.1:9999')).status).toBe(403);
        expect((await post('login', { consent: true }, 'https://evil.example')).status).toBe(403);
        expect(bridge.login).not.toHaveBeenCalled();
        expect((await post('login', { consent: true })).status).toBe(200);
        expect(bridge.login).toHaveBeenCalledExactlyOnceWith({ type: 'chatgpt' });
    });
    it('routes explicit refresh, cancel and logout and redacts transport failures', async () => {
        for (const action of ['refresh', 'cancel', 'logout']) {
            expect((await post(action)).status).toBe(200);
            expect(bridge[action]).toHaveBeenCalledOnce();
        }
        bridge.refresh.mockRejectedValue(new Error('secret-access-token'));
        const response = await post('refresh');
        expect(response.status).toBe(503);
        expect(await response.text()).not.toContain('secret-access-token');
    });
    it('throttles repeated connection attempts without blocking cancel or logout', async () => {
        for (let i = 0; i < 10; i++) expect((await post('refresh')).status).toBe(200);
        const limited = await post('login', { consent: true });
        expect(limited.status).toBe(429);
        expect(bridge.login).not.toHaveBeenCalled();
        expect(limited.headers.get('retry-after')).toBeTruthy();
        expect((await post('cancel')).status).toBe(200);
        expect((await post('logout')).status).toBe(200);
    });
    it('serves the local app shell and script behind authentication', async () => {
        for (const path of ['/', '/app.js']) {
            expect((await fetch(`${url}${path}`)).status).toBe(401);
            expect((await fetch(`${url}${path}`, { headers: { Cookie: cookie } })).status).toBe(
                200,
            );
        }
    });
});
