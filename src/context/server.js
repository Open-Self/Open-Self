import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { AccessAudit } from './access-audit.js';
import { ContextStore } from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createContextServer(options = {}) {
    const app = express();
    const token = options.token || randomBytes(24).toString('base64url');
    const host = options.host || '127.0.0.1';
    const port = Number(options.port || 3210);
    const ownsStore = !options.store;
    const store = options.store || new ContextStore({ dataDir: options.dataDir });

    app.disable('x-powered-by');
    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader(
            'Content-Security-Policy',
            "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
        );
        if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
        next();
    });
    app.use(express.json({ limit: '64kb' }));

    app.get('/auth', (req, res) => {
        if (!safeTokenEqual(req.query.token, token)) return res.status(401).send('Invalid token');
        res.setHeader(
            'Set-Cookie',
            `openself_context=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`,
        );
        return res.redirect(303, '/');
    });

    app.get('/', requireAuth(token), (_req, res) => {
        res.sendFile(join(__dirname, 'dashboard', 'index.html'));
    });
    app.get('/dashboard.js', requireAuth(token), (_req, res) => {
        res.type('application/javascript').sendFile(join(__dirname, 'dashboard', 'dashboard.js'));
    });
    for (const script of ['debugger.js', 'inbox.js', 'audit.js']) {
        app.get(`/${script}`, requireAuth(token), (_req, res) => {
            res.type('application/javascript').sendFile(join(__dirname, 'dashboard', script));
        });
    }
    app.get('/dashboard.css', requireAuth(token), (_req, res) => {
        res.type('text/css').sendFile(join(__dirname, 'dashboard', 'dashboard.css'));
    });

    const api = express.Router();
    api.use(requireAuth(token));

    api.get('/stats', (_req, res) => res.json(store.stats()));

    api.get('/memories', (req, res) => {
        const options = {
            scope: optionalString(req.query.scope),
            type: optionalString(req.query.type),
            limit: numberParam(req.query.limit, 50),
            maxSensitivity: optionalString(req.query.maxSensitivity) || 'restricted',
            retrieval: optionalString(req.query.retrieval) || 'hybrid',
        };
        const query = optionalString(req.query.q);
        const memories = query ? store.search(query, options) : store.list(options);
        res.json({ memories });
    });

    api.get('/memories/:id', (req, res) => {
        const memory = store.get(req.params.id, {
            includeForgotten: req.query.forgotten === 'true',
        });
        if (!memory) return res.status(404).json({ error: 'Memory not found' });
        return res.json({ memory });
    });

    api.get('/memories/:id/history', (req, res) => {
        const history = store.history(req.params.id);
        if (!history.length) return res.status(404).json({ error: 'Memory not found' });
        return res.json({ history });
    });

    api.post('/memories', requireLocalMutation, (req, res) => {
        const potentialConflicts = store.findPotentialConflicts(req.body);
        const memory = store.remember(req.body);
        res.status(201).json({ memory, potentialConflicts });
    });

    api.patch('/memories/:id', requireLocalMutation, (req, res) => {
        const existing = store.get(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Memory not found' });
        const proposed = {
            ...existing,
            ...req.body,
            source: { ...existing.source, ...(req.body.source || {}) },
        };
        const potentialConflicts = store.findPotentialConflicts(proposed, {
            excludeIds: [req.params.id],
        });
        const memory = store.update(req.params.id, req.body);
        return res.json({ memory, potentialConflicts });
    });

    api.delete('/memories/:id', requireLocalMutation, (req, res) => {
        const forgotten = store.forget(req.params.id);
        if (!forgotten) return res.status(404).json({ error: 'Memory not found' });
        return res.json({ forgotten: true, id: req.params.id });
    });

    api.post('/memories/:id/merge', requireLocalMutation, (req, res) => {
        if (!Array.isArray(req.body.duplicateIds) || !req.body.duplicateIds.length) {
            return res.status(400).json({ error: 'duplicateIds must be a non-empty array' });
        }
        if (!store.get(req.params.id)) {
            return res.status(404).json({ error: 'Primary memory not found' });
        }
        const missing = req.body.duplicateIds.find((id) => !store.get(id));
        if (missing)
            return res.status(404).json({ error: `Duplicate memory not found: ${missing}` });
        const result = store.merge(req.params.id, req.body.duplicateIds, req.body.changes || {});
        return res.json(result);
    });

    api.post('/conflicts', requireLocalMutation, (req, res) => {
        res.json({ potentialConflicts: store.findPotentialConflicts(req.body, req.body) });
    });

    // Context Debugger: compileContext with an explain receipt. Read-only —
    // mirrors what an agent would receive for the same request.
    api.get('/debug', (req, res) => {
        const query = optionalString(req.query.q);
        if (!query) return res.status(400).json({ error: 'q query parameter is required' });
        const result = store.compileContext(
            {
                query,
                task: optionalString(req.query.task),
                agent: optionalString(req.query.agent),
                purpose: optionalString(req.query.purpose),
                scope: optionalString(req.query.scope),
                retrieval: optionalString(req.query.retrieval) || 'hybrid',
                format: optionalString(req.query.format) || 'block',
                minSourceTrust: optionalString(req.query.minSourceTrust),
                asOf: optionalString(req.query.asOf),
                includeSuperseded: req.query.includeSuperseded === 'true',
                includeStale: req.query.includeStale === 'true',
                explain: true,
                budget: {
                    maxChars: numberParam(req.query.maxChars, 8_000),
                    maxTokens: numberParam(req.query.maxTokens, undefined),
                    maxItems: numberParam(req.query.limit, undefined),
                },
            },
            {
                // The dashboard is the vault owner's local tool — diagnostics
                // receipts may enumerate policy-denied candidates.
                diagnostics: true,
                envelope: {
                    clientId: 'dashboard',
                    maxSensitivity: optionalString(req.query.maxSensitivity) || 'restricted',
                    minSourceTrust: optionalString(req.query.minSourceTrust) || 'untrusted',
                    budget: {
                        maxChars: numberParam(req.query.maxChars, 8_000),
                        maxTokens: numberParam(req.query.maxTokens, undefined),
                        maxItems: numberParam(req.query.limit, undefined),
                    },
                },
            },
        );
        return res.json(result);
    });

    api.get('/proposals', (req, res) => {
        const status = optionalString(req.query.status);
        res.json({
            proposals: store.listProposals({
                status: status === 'all' ? null : status || 'pending',
                limit: numberParam(req.query.limit, 100),
            }),
        });
    });

    api.post('/proposals/:id/approve', requireLocalMutation, (req, res) => {
        const existing = store.getProposal(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Proposal not found' });
        if (existing.status !== 'pending') {
            return res.status(409).json({ error: `Already ${existing.status}` });
        }
        const memory = store.approveProposal(req.params.id, req.body?.overrides || {}, {
            reviewNote: req.body?.reviewNote,
        });
        return res.json({ approved: true, memory });
    });

    api.post('/proposals/:id/reject', requireLocalMutation, (req, res) => {
        const rejected = store.rejectProposal(req.params.id, {
            reviewNote: req.body?.reviewNote,
        });
        if (!rejected) {
            const existing = store.getProposal(req.params.id);
            return res
                .status(existing ? 409 : 404)
                .json({ error: existing ? `Already ${existing.status}` : 'Proposal not found' });
        }
        return res.json({ rejected: true, id: req.params.id });
    });

    // Read-only view over the MCP access audit, when the vault has one. The
    // audit database lives beside context.db and is opened read-only so the
    // dashboard never creates or mutates it.
    api.get('/audit', (_req, res) => {
        if (typeof store.dbPath !== 'string' || store.dbPath === ':memory:') {
            return res.json({ events: [] });
        }
        const auditPath = join(dirname(store.dbPath), 'mcp-audit.db');
        if (!existsSync(auditPath)) {
            return res.json({ events: [] });
        }
        let audit;
        try {
            audit = new AccessAudit({ dbPath: auditPath, readonly: true });
        } catch {
            return res.json({ events: [], chain: null });
        }
        try {
            const events = audit.list({ limit: 200 });
            return res.json({ events, chain: audit.verify() });
        } finally {
            audit.close();
        }
    });

    app.use('/api/context', api);
    app.use((error, _req, res, _next) => {
        const status = error?.name === 'ZodError' || error instanceof SyntaxError ? 400 : 500;
        res.status(status).json({ error: status === 400 ? error.message : 'Context server error' });
    });

    return {
        app,
        token,
        host,
        port,
        store,
        close() {
            if (ownsStore) store.close();
        },
    };
}

function requireAuth(token) {
    return (req, res, next) => {
        const bearer = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
        const cookie = parseCookies(req.headers.cookie).openself_context;
        if (!safeTokenEqual(bearer || cookie, token)) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        return next();
    };
}

function requireLocalMutation(req, res, next) {
    const origin = req.headers.origin;
    if (origin && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) {
        return res.status(403).json({ error: 'Cross-origin mutation blocked' });
    }
    return next();
}

function parseCookies(header = '') {
    return Object.fromEntries(
        header
            .split(';')
            .map((part) => part.trim().split('='))
            .filter(([key, value]) => key && value)
            .map(([key, value]) => [key, decodeURIComponent(value)]),
    );
}

function safeTokenEqual(candidate, expected) {
    if (typeof candidate !== 'string') return false;
    const left = Buffer.from(candidate);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
}

function optionalString(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberParam(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}
