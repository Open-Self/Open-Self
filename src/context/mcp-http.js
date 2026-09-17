import { randomBytes, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createContextMcpServer } from './mcp.js';

const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/**
 * Authenticated, localhost-first Streamable HTTP transport for the Context MCP
 * server. Stateless request handling: no server-side MCP sessions, so any
 * process restart is safe and horizontal duplication is trivial.
 *
 * Threat model: the bearer token authorizes MCP requests. Host/Origin checks
 * and a localhost default bind defend against DNS-rebinding and browser
 * cross-origin reads. `--allow-remote` only removes the loopback expectation;
 * it never removes authentication.
 */
export function createMcpHttpApp(options = {}) {
    const { store, policy, audit } = options;
    if (!store) throw new Error('createMcpHttpApp requires a ContextStore');
    const allowRemote = Boolean(options.allowRemote);
    const host = options.host || '127.0.0.1';
    const token = options.token || process.env.OPENSELF_MCP_TOKEN || null;
    const generatedToken = !token && !allowRemote;
    const bearer = token || randomBytes(24).toString('base64url');

    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', false);
    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Cache-Control', 'no-store');
        next();
    });

    // DNS-rebinding defense: only accept Host headers that resolve to this
    // listener. Remote mode delegates network restriction to the operator and
    // still enforces authentication on every request.
    app.use('/mcp', (req, res, next) => {
        if (!allowRemote && !isLocalHostHeader(req.headers.host)) {
            return res.status(403).json({ error: 'Host header is not permitted' });
        }
        const origin = req.headers.origin;
        if (origin && !allowRemote && !isLocalOrigin(origin)) {
            return res.status(403).json({ error: 'Origin is not permitted' });
        }
        const header = req.headers.authorization;
        const presented = header?.match(/^Bearer\s+(.+)$/i)?.[1];
        if (!safeEqual(presented, bearer)) {
            res.setHeader('WWW-Authenticate', 'Bearer realm="openself-mcp"');
            return res.status(401).json({ error: 'Authentication required' });
        }
        return next();
    });

    app.get('/mcp', (_req, res) => {
        res.status(405).json({ error: 'Use POST for stateless MCP requests' });
    });
    app.delete('/mcp', (_req, res) => {
        res.status(405).json({ error: 'Stateless transport does not manage sessions' });
    });

    app.post('/mcp', express.json({ limit: '1mb' }), async (req, res) => {
        let transport;
        let server;
        try {
            transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
            server = createContextMcpServer(store, {
                policy,
                audit,
                version: options.version,
            });
            res.on('close', () => {
                transport.close().catch(() => {});
                server.close().catch(() => {});
            });
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
        } catch {
            if (!res.headersSent) {
                res.status(500).json({ error: 'MCP request failed' });
            }
            transport?.close().catch(() => {});
            server?.close().catch(() => {});
        }
    });

    app.get('/healthz', (_req, res) => res.json({ ok: true }));

    return { app, token: bearer, generatedToken, host, allowRemote };
}

/**
 * Convenience runner: create the app and listen. `host` must remain a loopback
 * address unless `allowRemote` is set explicitly.
 */
export async function runContextMcpHttpServer(options = {}) {
    const host = options.host || '127.0.0.1';
    const allowRemote = Boolean(options.allowRemote);
    if (!allowRemote && !LOCAL_HOSTNAMES.has(host)) {
        throw new Error(
            `Refusing to bind MCP HTTP to ${host}. Use --allow-remote with an explicit token for non-localhost binds.`,
        );
    }
    if (allowRemote && !options.token && !process.env.OPENSELF_MCP_TOKEN) {
        throw new Error('Remote MCP HTTP requires an explicit --token or OPENSELF_MCP_TOKEN');
    }
    const { app, token, generatedToken } = createMcpHttpApp({ ...options, host, allowRemote });
    const requestedPort =
        options.port === undefined || options.port === null ? 3211 : Number(options.port);
    const listener = await new Promise((resolve, reject) => {
        const instance = app.listen(requestedPort, host, () => resolve(instance));
        instance.once('error', reject);
    });
    const port = listener.address()?.port ?? requestedPort;
    return {
        app,
        listener,
        token,
        generatedToken,
        host,
        port,
        url: `http://${host === '::1' || host === '::' ? '[::1]' : host}:${port}/mcp`,
        close: () => new Promise((resolve) => listener.close(resolve)),
    };
}

function isLocalHostHeader(host) {
    if (typeof host !== 'string') return false;
    const hostname = host.replace(/:\d+$/, '');
    return LOCAL_HOSTNAMES.has(hostname);
}

function isLocalOrigin(origin) {
    try {
        const url = new URL(origin);
        return LOCAL_HOSTNAMES.has(url.hostname) || url.hostname === '[::1]';
    } catch {
        return false;
    }
}

function safeEqual(candidate, expected) {
    if (typeof candidate !== 'string' || typeof expected !== 'string') return false;
    const left = Buffer.from(candidate);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
}
