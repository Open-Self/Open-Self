import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const CONTEXT_RECEIPT_URI = 'ui://openself/context-receipt/v1';
export const MCP_APP_MIME_TYPE = 'text/html;profile=mcp-app';

let receiptHtml;

/** A static, store-independent bundle. Context arrives only via the UI protocol. */
export function getContextReceiptHtml() {
    if (receiptHtml !== undefined) return receiptHtml;
    const read = (name) => readFileSync(new URL(`./mcp-app/${name}`, import.meta.url), 'utf8');
    const css = read('card.css');
    const js = read('card.js');
    const hash = (value) => createHash('sha256').update(value).digest('base64');
    // Hash only the exact bytes placed inside the inline elements. No external
    // sources, connections, workers, nested frames, forms, or plugins are needed.
    const csp = [
        "default-src 'none'",
        `script-src 'sha256-${hash(js)}'`,
        `style-src 'sha256-${hash(css)}'`,
        "connect-src 'none'",
        "img-src 'none'",
        "font-src 'none'",
        "frame-src 'none'",
        "worker-src 'none'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
    ].join('; ');
    receiptHtml = read('card.html')
        .replace('{{STYLE}}', () => `<style>${css}</style>`)
        .replace('{{SCRIPT}}', () => `<script>${js}</script>`)
        .replace('<head>', `<head>\n<meta http-equiv="Content-Security-Policy" content="${csp}">`);
    return receiptHtml;
}
