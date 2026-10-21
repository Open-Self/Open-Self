import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodexAuthBridge } from '../src/context/codex-bridge.js';

const bridges = [];
const directories = [];
function fixture({ handler, ...options } = {}) {
    const dataDir = mkdtempSync(join(tmpdir(), 'openself-codex-test-'));
    directories.push(dataDir);
    const messages = [];
    let child;
    const spawnImpl = vi.fn(() => {
        child = new EventEmitter();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        child.kill = vi.fn();
        child.stdin = new Writable({
            write(chunk, _encoding, callback) {
                const message = JSON.parse(chunk.toString());
                messages.push(message);
                if ('id' in message) {
                    const result = handler ? handler(message, child) : defaultReply(message);
                    if (result !== undefined) queueMicrotask(() => reply(message.id, result));
                }
                callback();
            },
        });
        return child;
    });
    function reply(id, result) {
        child.stdout.write(`${JSON.stringify({ id, result })}\n`);
    }
    const bridge = new CodexAuthBridge({ enabled: true, dataDir, spawnImpl, ...options });
    bridges.push(bridge);
    return {
        bridge,
        spawnImpl,
        messages,
        dataDir,
        get child() {
            return child;
        },
        notify(method, params) {
            child.stdout.write(`${JSON.stringify({ method, params })}\n`);
        },
    };
}
function defaultReply(message) {
    if (message.method === 'account/read') return { account: null, requiresOpenaiAuth: true };
    if (message.method === 'account/login/start')
        return { type: 'chatgpt', loginId: 'login-1', authUrl: 'https://chatgpt.com/auth/login' };
    return {};
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
afterEach(() => {
    for (const bridge of bridges.splice(0)) bridge.close();
    for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
    vi.unstubAllEnvs();
});

describe('isolated Codex authentication bridge', () => {
    it('is inert by default and never starts login from a status read', async () => {
        const f = fixture({ enabled: false });
        expect(f.bridge.getStatus()).toEqual({
            enabled: false,
            status: 'disabled',
            authenticated: false,
        });
        await f.bridge.refresh();
        await f.bridge.login();
        await f.bridge.cancel();
        await f.bridge.logout();
        expect(f.spawnImpl).not.toHaveBeenCalled();
    });
    it('uses isolated home, an explicit environment allowlist, and no shell', async () => {
        vi.stubEnv('OPENAI_API_KEY', 'secret-never-inherited');
        vi.stubEnv('CODEX_HOME', '/other-home');
        const f = fixture();
        expect(f.spawnImpl).not.toHaveBeenCalled();
        await f.bridge.refresh();
        const [command, args, options] = f.spawnImpl.mock.calls[0];
        expect(command).toBe('codex');
        expect(args).toEqual(['app-server', '--listen', 'stdio://']);
        expect(options.shell).toBe(false);
        expect(options.env.OPENAI_API_KEY).toBeUndefined();
        expect(options.env.CODEX_HOME).toBe(join(f.dataDir, 'codex-app'));
        expect(options.env.HOME).toBe(options.env.CODEX_HOME);
        expect(options.cwd).toBe(options.env.CODEX_HOME);
        expect(f.messages.map((m) => m.method)).toEqual([
            'initialize',
            'initialized',
            'account/read',
        ]);
        expect(f.messages[0].params.capabilities).toBeNull();
        expect(f.messages.at(-1).params).toEqual({ refreshToken: false });
    });
    it('reuses initialized transport and recognizes only a verified ChatGPT account', async () => {
        const f = fixture({
            handler: (m) =>
                m.method === 'account/read'
                    ? {
                          account: {
                              type: 'chatgpt',
                              email: 'private@example.com',
                              planType: 'plus',
                              accessToken: 'secret',
                          },
                      }
                    : {},
        });
        await f.bridge.refresh();
        const status = await f.bridge.refresh();
        expect(status).toEqual({
            enabled: true,
            status: 'connected',
            authenticated: true,
            planType: 'plus',
        });
        expect(f.spawnImpl).toHaveBeenCalledTimes(1);
        await f.bridge.login();
        expect(f.messages.some((m) => m.method === 'account/login/start')).toBe(false);
    });
    it('does not report API-key accounts as ChatGPT connected', async () => {
        const f = fixture({
            handler: (m) => (m.method === 'account/read' ? { account: { type: 'apiKey' } } : {}),
        });
        expect((await f.bridge.refresh()).authenticated).toBe(false);
    });
    it('requires successful matching completion AND a verified account read', async () => {
        let signedIn = false;
        const f = fixture({
            handler: (m) =>
                m.method === 'account/read'
                    ? { account: signedIn ? { type: 'chatgpt', planType: 'pro' } : null }
                    : defaultReply(m),
        });
        const status = await f.bridge.login();
        expect(status.status).toBe('pending');
        expect(status.authenticated).toBe(false);
        await f.bridge.login();
        expect(f.messages.filter((m) => m.method === 'account/login/start')).toHaveLength(1);
        await f.bridge.refresh();
        expect(f.bridge.getStatus().status).toBe('pending');
        f.notify('account/updated', { authMode: 'chatgpt', planType: 'pro' });
        await tick();
        expect(f.bridge.getStatus().authenticated).toBe(false);
        f.notify('account/login/completed', { loginId: 'wrong', success: true });
        await tick();
        expect(f.bridge.getStatus().authenticated).toBe(false);
        signedIn = true;
        f.notify('account/login/completed', { loginId: 'login-1', success: true });
        await tick();
        expect(f.bridge.getStatus()).toEqual({
            enabled: true,
            status: 'connected',
            authenticated: true,
            planType: 'pro',
        });
    });
    it('does not infer authentication from success when account/read is null', async () => {
        const f = fixture();
        await f.bridge.login();
        f.notify('account/login/completed', { loginId: 'login-1', success: true });
        await tick();
        expect(f.bridge.getStatus().authenticated).toBe(false);
    });
    it('sanitizes failed completion details', async () => {
        const f = fixture();
        await f.bridge.login();
        f.notify('account/login/completed', {
            loginId: 'login-1',
            success: false,
            error: 'access_token=secret',
        });
        await tick();
        expect(f.bridge.getStatus().status).toBe('error');
        expect(JSON.stringify(f.bridge.getStatus())).not.toContain('secret');
    });
    it('cancels pending login and ignores a late success notification', async () => {
        const f = fixture();
        await f.bridge.login();
        await f.bridge.cancel();
        expect(f.messages.at(-1)).toMatchObject({
            method: 'account/login/cancel',
            params: { loginId: 'login-1' },
        });
        f.notify('account/login/completed', { loginId: 'login-1', success: true });
        await tick();
        expect(f.bridge.getStatus().authenticated).toBe(false);
        expect(f.bridge.getStatus().loginId).toBeUndefined();
        await f.bridge.cancel();
        expect(f.messages.filter((m) => m.method === 'account/login/cancel')).toHaveLength(1);
    });
    it('logs out and verifies cleared account, cancelling pending authorization first', async () => {
        const f = fixture();
        await f.bridge.login();
        await f.bridge.logout();
        expect(f.messages.slice(-3).map((m) => m.method)).toEqual([
            'account/login/cancel',
            'account/logout',
            'account/read',
        ]);
        expect(f.bridge.getStatus().authenticated).toBe(false);
    });
    it('invalidates displayed authentication on account logout notification', async () => {
        const f = fixture({
            handler: (m) =>
                m.method === 'account/read'
                    ? { account: { type: 'chatgpt', planType: 'plus' } }
                    : {},
        });
        await f.bridge.refresh();
        f.notify('account/updated', { authMode: null });
        await tick();
        expect(f.bridge.getStatus().authenticated).toBe(false);
    });
    it('supports validated device authorization responses', async () => {
        const f = fixture({
            handler: (m) =>
                m.method === 'account/login/start'
                    ? {
                          type: 'chatgptDeviceCode',
                          loginId: 'device-1',
                          verificationUrl: 'https://auth.openai.com/codex/device',
                          userCode: 'ABCD-1234',
                      }
                    : {},
        });
        expect(await f.bridge.login({ type: 'chatgptDeviceCode' })).toMatchObject({
            status: 'pending',
            userCode: 'ABCD-1234',
            authenticated: false,
        });
    });
    it.each([
        'https://auth.openai.com.evil.test/login',
        'http://auth.openai.com/login',
        'https://a:b@auth.openai.com/login',
        'https://auth.openai.com:444/login',
        'javascript:alert(1)',
        'garbage',
    ])('rejects unsafe auth URL %s', async (authUrl) => {
        const f = fixture({
            handler: (m) =>
                m.method === 'account/login/start'
                    ? { type: 'chatgpt', loginId: 'x', authUrl }
                    : {},
        });
        await expect(f.bridge.login()).rejects.toThrow('Codex connection failed');
        expect(f.child.kill).toHaveBeenCalled();
        expect(f.bridge.getStatus().authUrl).toBeUndefined();
    });
    it('rejects unsupported token import login modes before spawning', async () => {
        const f = fixture();
        await expect(f.bridge.login({ type: 'chatgptAuthTokens' })).rejects.toThrow('Unsupported');
        expect(f.spawnImpl).not.toHaveBeenCalled();
    });
    it('rejects concurrent connection actions rather than starting duplicate logins', async () => {
        const f = fixture();
        const first = f.bridge.login();
        await expect(f.bridge.login()).rejects.toThrow('already in progress');
        await first;
        expect(f.spawnImpl).toHaveBeenCalledTimes(1);
    });
    it('times out unanswered RPCs and allows a fresh-process retry', async () => {
        let hanging = true;
        const f = fixture({
            timeoutMs: 10,
            handler: (m) => (hanging ? undefined : defaultReply(m)),
        });
        await expect(f.bridge.refresh()).rejects.toThrow('Codex connection failed');
        expect(f.bridge.getStatus().status).toBe('error');
        hanging = false;
        await f.bridge.refresh();
        expect(f.spawnImpl).toHaveBeenCalledTimes(2);
    });
    it('fails closed on process exit and never exposes stderr', async () => {
        const f = fixture();
        await f.bridge.refresh();
        f.child.stderr.write('secret');
        f.child.emit('exit', 1);
        expect(f.bridge.getStatus().status).toBe('error');
        expect(JSON.stringify(f.bridge.getStatus())).not.toContain('secret');
    });
    it('rejects malformed or oversized transport messages', async () => {
        const f = fixture();
        await f.bridge.refresh();
        f.child.stdout.write('bad json\n');
        expect(f.bridge.getStatus().status).toBe('error');
        await f.bridge.refresh();
        f.child.stdout.write('x'.repeat(1024 * 1024 + 1));
        expect(f.bridge.getStatus().status).toBe('error');
    });
    it('sanitizes RPC errors and handles process startup errors', async () => {
        const f = fixture({
            handler: (m, child) => {
                queueMicrotask(() =>
                    child.stdout.write(
                        JSON.stringify({ id: m.id, error: { message: 'secret' } }) + '\n',
                    ),
                );
            },
        });
        await expect(f.bridge.refresh()).rejects.toThrow('Codex connection failed');
        expect(JSON.stringify(f.bridge.getStatus())).not.toContain('secret');
        const g = fixture({
            handler: (_m, child) => {
                queueMicrotask(() => child.emit('error', new Error('secret')));
            },
        });
        await expect(g.bridge.refresh()).rejects.toThrow('Codex connection failed');
    });
    it('does not restart after close', async () => {
        const f = fixture();
        await f.bridge.refresh();
        f.bridge.close();
        await f.bridge.refresh();
        expect(f.spawnImpl).toHaveBeenCalledTimes(1);
    });
    it('handles login response and completion delivered in the same transport chunk', async () => {
        const f = fixture({
            handler: (m, child) => {
                if (m.method === 'account/login/start') {
                    queueMicrotask(() =>
                        child.stdout.write(
                            JSON.stringify({
                                id: m.id,
                                result: {
                                    type: 'chatgpt',
                                    loginId: 'login-1',
                                    authUrl: 'https://auth.openai.com/authorize',
                                },
                            }) +
                                '\n' +
                                JSON.stringify({
                                    method: 'account/login/completed',
                                    params: { loginId: 'login-1', success: true },
                                }) +
                                '\n',
                        ),
                    );
                    return;
                }
                if (m.method === 'account/read')
                    return { account: { type: 'chatgpt', planType: 'pro' } };
                return {};
            },
        });
        await f.bridge.login();
        await tick();
        expect(f.bridge.getStatus().authenticated).toBe(true);
    });
    it('does not reconnect from a late verification response after cancellation', async () => {
        let readId;
        const f = fixture({
            handler: (m) => {
                if (m.method === 'account/read') {
                    readId = m.id;
                    return;
                }
                return defaultReply(m);
            },
        });
        await f.bridge.login();
        f.notify('account/login/completed', { loginId: 'login-1', success: true });
        await tick();
        await f.bridge.cancel();
        f.child.stdout.write(
            JSON.stringify({ id: readId, result: { account: { type: 'chatgpt' } } }) + '\n',
        );
        await tick();
        expect(f.bridge.getStatus().authenticated).toBe(false);
    });
});
