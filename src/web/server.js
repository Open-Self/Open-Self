/**
 * Web Chat Server — "Talk to My Clone"
 * Express server serving a chat UI + API endpoint
 */

import express from 'express';
import { ClonePipeline } from '../brain/pipeline.js';
import { generateBadge } from './badge.js';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createWebServer(options = {}) {
    const app = express();
    const port = options.port || 3000;
    const dataDir = options.dataDir || './data';

    // Rate limiting (simple in-memory)
    const rateLimit = new Map();
    const RATE_LIMIT = 20; // 20 messages per IP per minute
    const RATE_WINDOW = 60000;

    // Parse JSON
    app.use(express.json());

    // Serve static HTML
    app.get('/', (req, res) => {
        const htmlPath = join(__dirname, 'index.html');
        res.sendFile(htmlPath);
    });

    // API: Get clone info
    app.get('/api/info', (req, res) => {
        try {
            const soul = readFileSync(join(dataDir, 'SOUL.md'), 'utf-8');
            const nameMatch = soul.match(/- Name:\s*(.+)/);
            const langMatch = soul.match(/- Language:\s*(.+)/);

            res.json({
                name: nameMatch?.[1]?.trim() || 'Someone',
                language: langMatch?.[1]?.trim() || 'Unknown',
                status: 'online',
            });
        } catch {
            res.json({ name: 'Clone', language: 'Unknown', status: 'offline' });
        }
    });

    // Badge: SVG clone score badge
    app.get('/badge/:name', (req, res) => {
        try {
            const soul = readFileSync(join(dataDir, 'SOUL.md'), 'utf-8');
            const scoreMatch = soul.match(/Clone Score:\s*(\d+)/);
            const score = scoreMatch ? parseInt(scoreMatch[1]) : 75;
            const name = req.params.name || 'Clone';
            const dark = req.query.dark === 'true';

            const svg = generateBadge(name, score, { dark });
            res.setHeader('Content-Type', 'image/svg+xml');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.send(svg);
        } catch {
            const svg = generateBadge(req.params.name || 'Clone', 0);
            res.setHeader('Content-Type', 'image/svg+xml');
            res.send(svg);
        }
    });

    // Arena: View debate transcript
    app.get('/arena/:id', (req, res) => {
        try {
            const filepath = join(dataDir, `arena-${req.params.id}.md`);
            if (existsSync(filepath)) {
                const content = readFileSync(filepath, 'utf-8');
                res.setHeader('Content-Type', 'text/html');
                res.send(`<!DOCTYPE html>
<html><head><title>Clone Arena</title>
<style>body{font-family:system-ui;max-width:700px;margin:2rem auto;padding:0 1rem;background:#0f172a;color:#e2e8f0}
h1{color:#a78bfa}strong{color:#22d3ee}hr{border-color:#334155}</style></head>
<body>${content.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</body></html>`);
            } else {
                res.status(404).send('Arena debate not found');
            }
        } catch {
            res.status(500).send('Error loading arena debate');
        }
    });

    // Arena: List all debates
    app.get('/arena', (req, res) => {
        try {
            const files = readdirSync(dataDir).filter(f => f.startsWith('arena-') && f.endsWith('.md'));
            const debates = files.map(f => ({
                id: f.replace('arena-', '').replace('.md', ''),
                url: `/arena/${f.replace('arena-', '').replace('.md', '')}`,
            }));
            res.json({ debates });
        } catch {
            res.json({ debates: [] });
        }
    });

    // API: Chat with clone
    let pipeline = null;

    app.post('/api/chat', async (req, res) => {
        const { message, contact } = req.body;
        if (!message || typeof message !== 'string') {
            return res.status(400).json({ error: 'Message is required' });
        }

        if (message.length > 500) {
            return res.status(400).json({ error: 'Message too long (max 500 chars)' });
        }

        // Rate limit
        const ip = req.ip || 'unknown';
        const now = Date.now();
        const hits = rateLimit.get(ip) || [];
        const recent = hits.filter(t => now - t < RATE_WINDOW);
        if (recent.length >= RATE_LIMIT) {
            return res.status(429).json({ error: 'Too many messages. Please wait.' });
        }
        recent.push(now);
        rateLimit.set(ip, recent);

        // Lazy-init pipeline
        if (!pipeline) {
            try {
                pipeline = new ClonePipeline({ dataDir });
            } catch (err) {
                return res.status(500).json({ error: 'Clone not configured' });
            }
        }

        try {
            const result = await pipeline.processMessage(
                { text: message },
                { name: contact || 'Visitor', relationship: 'stranger', channel: 'web' },
            );

            if (result.action === 'reply') {
                res.json({ replies: result.replies });
            } else if (result.action === 'ignore') {
                res.json({ replies: ['...'] });
            } else {
                res.json({ replies: ['Hmm, để t check lại nha'] });
            }
        } catch (err) {
            res.status(500).json({ error: 'Clone error' });
        }
    });

    return { app, port };
}
