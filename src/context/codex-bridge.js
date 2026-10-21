import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { packageVersion } from '../version.js';

const SAFE_ERROR = 'Codex connection failed. Check the installed Codex CLI and try again.';
const MAX_MESSAGE_BYTES = 1024 * 1024;

/** Local-only managed authentication. Never reads or imports another Codex home's credentials. */
export class CodexAuthBridge {
    constructor({
        dataDir,
        enabled = false,
        command = 'codex',
        spawnImpl = spawn,
        timeoutMs = 15_000,
    } = {}) {
        this.enabled = enabled;
        this.command = command;
        this.spawnImpl = spawnImpl;
        this.timeoutMs = timeoutMs;
        this.home = resolve(dataDir || './data', 'codex-app');
        this.child = null;
        this.pending = new Map();
        this.nextId = 1;
        this.starting = null;
        this.busy = false;
        this.closed = false;
        this.state = { status: enabled ? 'disconnected' : 'disabled', authenticated: false };
    }

    getStatus() {
        return { enabled: this.enabled, ...this.state };
    }

    async refresh() {
        return this.operation(async () => {
            await this.start();
            // A pending browser authorization is not a verified account.
            if (!this.state.loginId) await this.readAccount();
        });
    }

    async login({ type = 'chatgpt' } = {}) {
        if (!['chatgpt', 'chatgptDeviceCode'].includes(type))
            throw new Error('Unsupported login method.');
        return this.operation(async () => {
            await this.start();
            if (this.state.loginId || this.state.authenticated) return;
            const result = await this.request('account/login/start', { type });
            const urlKey = type === 'chatgpt' ? 'authUrl' : 'verificationUrl';
            if (
                result?.type !== type ||
                typeof result.loginId !== 'string' ||
                !result.loginId ||
                !safeAuthUrl(result[urlKey]) ||
                (type === 'chatgptDeviceCode' &&
                    (typeof result.userCode !== 'string' ||
                        !/^[A-Za-z0-9-]{1,64}$/.test(result.userCode)))
            ) {
                this.fail();
                throw new Error(SAFE_ERROR);
            }
            this.state = {
                status: 'pending',
                authenticated: false,
                loginId: result.loginId,
                [urlKey]: result[urlKey],
            };
            if (type === 'chatgptDeviceCode') this.state.userCode = result.userCode;
        });
    }

    async cancel() {
        return this.operation(async () => {
            const loginId = this.state.loginId;
            // Invalidate locally first so late completion notifications cannot authenticate the UI.
            this.state = { status: 'disconnected', authenticated: false };
            if (loginId && this.child) await this.request('account/login/cancel', { loginId });
        });
    }

    async logout() {
        return this.operation(async () => {
            await this.start();
            const loginId = this.state.loginId;
            this.state = { status: 'disconnected', authenticated: false };
            if (loginId) await this.request('account/login/cancel', { loginId });
            await this.request('account/logout', {});
            await this.readAccount();
        });
    }

    async operation(action) {
        if (!this.enabled || this.closed) return this.getStatus();
        if (this.busy) throw new Error('A Codex connection action is already in progress.');
        this.busy = true;
        try {
            await action();
            return this.getStatus();
        } catch (error) {
            this.fail();
            throw new Error(SAFE_ERROR, { cause: error });
        } finally {
            this.busy = false;
        }
    }

    async start() {
        if (this.child && !this.starting) return;
        if (this.starting) return this.starting;
        this.state = { status: 'connecting', authenticated: false };
        this.starting = this.startProcess();
        try {
            await this.starting;
        } finally {
            this.starting = null;
        }
    }

    async startProcess() {
        mkdirSync(this.home, { recursive: true, mode: 0o700 });
        // Explicit allowlist: no API keys, auth tokens, provider config, or original HOME.
        const env = {};
        for (const key of [
            'PATH',
            'Path',
            'SystemRoot',
            'WINDIR',
            'TEMP',
            'TMP',
            'TMPDIR',
            'LANG',
        ]) {
            if (process.env[key]) env[key] = process.env[key];
        }
        env.CODEX_HOME = this.home;
        env.HOME = this.home;
        env.USERPROFILE = this.home;
        const child = this.spawnImpl(this.command, ['app-server', '--listen', 'stdio://'], {
            cwd: this.home,
            env,
            shell: false,
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
        });
        this.child = child;
        let buffer = '';
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk) => {
            if (this.child !== child) return;
            buffer += chunk;
            if (Buffer.byteLength(buffer) > MAX_MESSAGE_BYTES) return this.fail();
            let boundary;
            while ((boundary = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, boundary);
                buffer = buffer.slice(boundary + 1);
                if (!line.trim()) continue;
                try {
                    this.receive(JSON.parse(line), child);
                } catch {
                    this.fail();
                    return;
                }
            }
        });
        // Drain stderr but never expose it: a third-party CLI may log sensitive strings.
        child.stderr.resume();
        child.stdin.on('error', () => {
            if (this.child === child) this.fail();
        });
        child.on('error', () => {
            if (this.child === child) this.fail();
        });
        child.on('exit', () => {
            if (this.child === child) this.fail();
        });
        await this.request('initialize', {
            clientInfo: { name: 'openself', title: 'OpenSelf', version: packageVersion },
            capabilities: null,
        });
        this.child.stdin.write(`${JSON.stringify({ method: 'initialized' })}\n`);
        this.state = { status: 'disconnected', authenticated: false };
    }

    request(method, params) {
        if (!this.child) return Promise.reject(new Error(SAFE_ERROR));
        const id = this.nextId++;
        return new Promise((resolveRequest, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(SAFE_ERROR));
                this.fail();
            }, this.timeoutMs);
            this.pending.set(id, { resolve: resolveRequest, reject, timer });
            this.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
        });
    }

    receive(message, child) {
        if (Object.hasOwn(message, 'id')) {
            const request = this.pending.get(message.id);
            if (!request) return;
            clearTimeout(request.timer);
            this.pending.delete(message.id);
            if (message.error || !Object.hasOwn(message, 'result'))
                request.reject(new Error(SAFE_ERROR));
            else request.resolve(message.result);
            return;
        }
        queueMicrotask(() => {
            if (this.child === child) this.notification(message);
        });
    }

    notification(message) {
        if (
            message.method === 'account/login/completed' &&
            this.state.loginId &&
            message.params?.loginId === this.state.loginId
        ) {
            const loginId = this.state.loginId;
            if (message.params.success !== true) {
                this.state = {
                    status: 'error',
                    authenticated: false,
                    error: 'Codex sign-in did not complete. Try again.',
                };
                return;
            }
            // Verify account state; a successful notification alone is not sufficient.
            void this.readAccount(loginId).catch(() => this.fail());
        } else if (message.method === 'account/updated' && message.params?.authMode === null) {
            this.state = { status: 'disconnected', authenticated: false };
        }
    }

    async readAccount(expectedLoginId) {
        const result = await this.request('account/read', { refreshToken: false });
        if (expectedLoginId && this.state.loginId !== expectedLoginId) return;
        if (result?.account?.type === 'chatgpt') {
            const planType = result.account.planType;
            this.state = { status: 'connected', authenticated: true };
            if (typeof planType === 'string' && /^[a-z_0-9-]{1,40}$/i.test(planType))
                this.state.planType = planType;
        } else {
            this.state = { status: 'disconnected', authenticated: false };
        }
    }

    fail() {
        this.state = { status: 'error', authenticated: false, error: SAFE_ERROR };
        this.stopProcess();
    }

    stopProcess() {
        const child = this.child;
        this.child = null;
        for (const request of this.pending.values()) {
            clearTimeout(request.timer);
            request.reject(new Error(SAFE_ERROR));
        }
        this.pending.clear();
        if (child) child.kill();
    }

    close() {
        this.closed = true;
        this.stopProcess();
        this.state = { status: this.enabled ? 'disconnected' : 'disabled', authenticated: false };
    }
}

function safeAuthUrl(value) {
    try {
        const url = new URL(value);
        return (
            url.protocol === 'https:' &&
            ['auth.openai.com', 'chatgpt.com'].includes(url.hostname) &&
            !url.username &&
            !url.password &&
            (!url.port || url.port === '443')
        );
    } catch {
        return false;
    }
}
