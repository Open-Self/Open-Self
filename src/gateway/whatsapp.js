/**
 * WhatsApp Gateway
 * Clone live on WhatsApp via Baileys (multi-device)
 */

import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
} from '@whiskeysockets/baileys';
import qrcodeTerminal from 'qrcode-terminal';
import { ClonePipeline } from '../brain/pipeline.js';
import { GhostMode } from '../ghost/ghost.js';
import { TimingEngine } from '../mimicry/timing.js';
import { mkdirSync, existsSync } from 'fs';
import chalk from 'chalk';

export class WhatsAppGateway {
    constructor(config = {}) {
        this.sessionDir = config.sessionDir || './data/whatsapp-session';
        this.pipeline = new ClonePipeline({ config: config.appConfig });
        this.ghost = new GhostMode(config.dataDir || './data');
        this.sock = null;

        this.stats = { received: 0, replied: 0, ignored: 0, queued: 0 };
        this._reconnecting = false;
    }

    /**
     * Start WhatsApp connection with QR code pairing.
     * Public entrypoint — `_connect` does the actual socket setup so we
     * can call it on reconnect without re-entering reconnect-handler logic.
     */
    async start() {
        if (!existsSync(this.sessionDir)) {
            mkdirSync(this.sessionDir, { recursive: true });
        }
        await this._connect();
        console.log(chalk.gray('  WhatsApp → Settings → Linked Devices → Link a Device'));
        console.log(chalk.gray('  Session will be saved for future reconnections'));
    }

    /**
     * Create the baileys socket + bind handlers. Idempotent on reconnect:
     * tears down any prior socket listeners before creating a new one to
     * avoid the duplicate-handler reply storm when network flaps.
     */
    async _connect() {
        if (this.sock) {
            try { this.sock.ev.removeAllListeners(); } catch { /* noop */ }
            try { this.sock.end(undefined); } catch { /* noop */ }
            this.sock = null;
        }

        const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);

        // baileys ^6.7 deprecated `printQRInTerminal`; render via qrcode-terminal
        this.sock = makeWASocket({
            auth: state,
            browser: ['OpenSelf', 'Chrome', '120.0'],
            syncFullHistory: false,
        });

        this.sock.ev.on('creds.update', saveCreds);

        this.sock.ev.on('connection.update', (update) => {
            this._handleConnectionUpdate(update);
        });

        this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;
            for (const msg of messages) {
                await this._handleMessage(msg);
            }
        });
    }

    /**
     * Handle connection status changes
     */
    _handleConnectionUpdate(update) {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrcodeTerminal.generate(qr, { small: true });
            console.log(chalk.white('  📱 Scan the QR code above with WhatsApp on your phone'));
        }

        if (connection === 'open') {
            console.log(chalk.green('\n🤖 WhatsApp connected!'));
            console.log(chalk.gray('   Listening for messages...'));
            console.log(chalk.gray('   Press Ctrl+C to stop'));
            this.ghost.startHeartbeat();
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            if (shouldReconnect && !this._reconnecting) {
                this._reconnecting = true;
                console.log(chalk.yellow('\n⚠️  Disconnected. Reconnecting in 3s...'));
                setTimeout(async () => {
                    this._reconnecting = false;
                    try {
                        await this._connect();
                    } catch (err) {
                        console.error(chalk.red(`Reconnect failed: ${err.message}`));
                    }
                }, 3000);
            } else if (!shouldReconnect) {
                console.log(chalk.red('\n🛑 Logged out. Delete data/whatsapp-session/ and re-scan.'));
                this.ghost.stopHeartbeat();
            }
        }
    }

    /**
     * Handle an incoming WhatsApp message
     */
    async _handleMessage(msg) {
        // Skip non-text messages, status updates, and own messages
        if (!msg.message) return;
        if (msg.key.fromMe) return;
        if (msg.key.remoteJid === 'status@broadcast') return;

        const text = msg.message.conversation
            || msg.message.extendedTextMessage?.text
            || msg.message.imageMessage?.caption
            || '';

        if (!text.trim()) return;

        this.stats.received++;

        const isGroup = msg.key.remoteJid.endsWith('@g.us');
        const senderName = msg.pushName || msg.key.participant?.split('@')[0] || 'Unknown';

        // Group chat: only reply if @mentioned or quoted
        if (isGroup) {
            const mentionedMe = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.some(
                jid => jid === this.sock.user?.id
            );
            const quotedMe = msg.message.extendedTextMessage?.contextInfo?.participant === this.sock.user?.id;

            if (!mentionedMe && !quotedMe) {
                this.stats.ignored++;
                return;
            }
        }

        // Ghost Mode check: only reply if ghost mode is active and user is offline
        // (If ghost mode is disabled, always reply normally)
        if (this.ghost.getStatus().ghostMode && !this.ghost.shouldCloneReply()) {
            this.stats.ignored++;
            return;
        }

        const contact = {
            name: senderName,
            jid: msg.key.remoteJid,
            isGroup,
            channel: 'WhatsApp',
        };

        console.log(chalk.cyan(`📨 ${contact.name}: "${text.slice(0, 60)}${text.length > 60 ? '...' : ''}"`));

        try {
            const result = await this.pipeline.processMessage(
                { text, isGroup },
                contact,
            );

            if (result.action === 'ignore') {
                this.stats.ignored++;
                console.log(chalk.gray('   → Ignored (mimicry)'));
                return;
            }

            if (result.action === 'queued') {
                this.stats.queued++;
                console.log(chalk.yellow('   → Queued for review'));
                return;
            }

            if (result.action === 'blocked') {
                console.log(chalk.red('   → Blocked by safety guard'));
                return;
            }

            if (result.action === 'reply' && result.replies.length > 0) {
                // Read delay
                const readDelay = Math.min(result.delay * 0.3, 5000);
                await TimingEngine.sleep(readDelay);

                // Send read receipt
                try {
                    await this.sock.readMessages([msg.key]);
                } catch { /* non-critical */ }

                for (let i = 0; i < result.replies.length; i++) {
                    // Typing indicator
                    await this.sock.presenceSubscribe(msg.key.remoteJid);
                    await this.sock.sendPresenceUpdate('composing', msg.key.remoteJid);
                    const typingTime = Math.min(result.replies[i].length * 60, 4000);
                    await TimingEngine.sleep(typingTime);
                    await this.sock.sendPresenceUpdate('paused', msg.key.remoteJid);

                    // Send reply
                    await this.sock.sendMessage(msg.key.remoteJid, {
                        text: result.replies[i],
                    });

                    console.log(chalk.green(`   → "${result.replies[i].slice(0, 60)}${result.replies[i].length > 60 ? '...' : ''}"`));

                    // Inter-message delay
                    if (i < result.replies.length - 1) {
                        await TimingEngine.sleep(1000 + Math.random() * 2000);
                    }
                }

                this.stats.replied++;
            }
        } catch (err) {
            console.error(chalk.red(`   → Error: ${err.message}`));
        }
    }

    /**
     * Stop the WhatsApp connection
     */
    stop() {
        this.ghost.stopHeartbeat();
        if (this.sock) {
            this.sock.end(undefined);
        }
        console.log(chalk.yellow('\n🛑 WhatsApp bot stopped'));
        console.log(chalk.white(`   ${this.stats.received} received, ${this.stats.replied} replied, ${this.stats.ignored} ignored, ${this.stats.queued} queued`));
    }

    getStats() {
        return this.stats;
    }
}
