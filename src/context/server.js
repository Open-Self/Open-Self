import { randomBytes, timingSafeEqual } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
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
