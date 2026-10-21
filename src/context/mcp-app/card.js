/* global window, document, ResizeObserver */
// Minimal receive-only MCP Apps transport, protocol 2026-01-26.
// Parent-window identity is a transport check, not authorization of tool data.
(() => {
    const VERSION = '2026-01-26';
    const INIT_ID = 'openself-receipt-init';
    const status = document.getElementById('status');
    const root = document.getElementById('receipt');
    const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
    const string = (value, max = 1024) => typeof value === 'string' && value.length <= max;
    const integer = (value, max = 200000) =>
        Number.isSafeInteger(value) && value >= 0 && value <= max;
    const id = (value) => string(value, 128) || Number.isSafeInteger(value);
    let ready = false,
        terminal = false,
        closed = false,
        early = null;
    let resultTimer, resizeTimer, observer;
    let lastSize = '',
        sizeReports = 0;

    // Bound aggregate strings/keys before serialization as well as depth and nodes.
    // The 1 MiB envelope cap is deliberate: large Unicode or duplicated tool text
    // may exceed it even when the context field itself is within 200k characters.
    function bounded(value) {
        let nodes = 0;
        let characters = 0;
        const count = (text) => {
            characters += text.length;
            return characters <= 1048576;
        };
        const visit = (item, depth) => {
            if (++nodes > 30000 || depth > 20) return false;
            if (typeof item === 'string') return count(item);
            if (item === null || typeof item === 'boolean') return true;
            if (typeof item === 'number') return Number.isFinite(item);
            if (typeof item !== 'object') return false;
            if (Array.isArray(item) && item.length > 500) return false;
            const keys = Object.keys(item);
            if (keys.length > 500 || !keys.every(count)) return false;
            // Visit holes as undefined too: sparse arrays are not JSON data.
            const values = Array.isArray(item) ? Array.from(item) : Object.values(item);
            return values.length <= 500 && values.every((child) => visit(child, depth + 1));
        };
        try {
            return (
                visit(value, 0) && new TextEncoder().encode(JSON.stringify(value)).length <= 1048576
            );
        } catch {
            return false;
        }
    }
    function post(message) {
        window.parent.postMessage({ jsonrpc: '2.0', ...message }, '*');
    }
    function element(tag, text, parent = root) {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        parent.appendChild(node);
        return node;
    }
    function theme(context) {
        if (object(context) && ['light', 'dark'].includes(context.theme)) {
            document.documentElement.dataset.theme = context.theme;
        }
    }
    function size() {
        if (!ready || closed || resizeTimer || sizeReports >= 100) return;
        resizeTimer = setTimeout(() => {
            resizeTimer = null;
            const width = Math.min(4096, Math.max(1, Math.ceil(window.innerWidth || 1)));
            const height = Math.min(10000, Math.max(1, Math.ceil(document.body.scrollHeight || 1)));
            const key = `${width}:${height}`;
            if (key === lastSize) return;
            lastSize = key;
            sizeReports++;
            post({ method: 'ui/notifications/size-changed', params: { width, height } });
        }, 100);
    }
    function finish(message) {
        terminal = true;
        early = null;
        clearTimeout(initTimer);
        clearTimeout(resultTimer);
        root.replaceChildren();
        status.textContent = message;
        size();
    }
    function recordValid(record) {
        return (
            object(record) &&
            [
                'id',
                'scope',
                'sourceTrust',
                'sensitivity',
                'temporalStatus',
                'selectionReason',
                'reason',
            ].every((key) => record[key] === undefined || string(record[key]))
        );
    }
    function render(params) {
        if (params.isError === true) {
            finish('The context tool returned an error. No receipt is available.');
            return;
        }
        const data = params.structuredContent;
        const receipt = data?.receipt;
        if (
            !object(data) ||
            !string(data.context, 200000) ||
            !Array.isArray(data.memories) ||
            data.memories.length > 500 ||
            !data.memories.every(recordValid) ||
            !integer(data.items, 500) ||
            data.items !== data.memories.length ||
            (data.contextHash !== undefined && !string(data.contextHash, 256)) ||
            (receipt !== undefined &&
                (!object(receipt) ||
                    (receipt.candidates !== undefined &&
                        (!Array.isArray(receipt.candidates) ||
                            receipt.candidates.length > 500 ||
                            !receipt.candidates.every(
                                (item) =>
                                    object(item) &&
                                    (item.decision === 'denied' ||
                                        (['selected', 'skipped'].includes(item.decision) &&
                                            recordValid(item))),
                            ))) ||
                    (receipt.budget !== undefined && !object(receipt.budget)) ||
                    ['contextHash', 'receiptHash', 'signature', 'receiptSignature'].some(
                        (key) => receipt[key] !== undefined && !string(receipt[key], 1024),
                    )))
        ) {
            finish(
                'The host supplied an invalid or oversized context package. Nothing was rendered.',
            );
            return;
        }
        terminal = true;
        clearTimeout(resultTimer);
        status.textContent =
            data.items === 0 ? 'No context records were selected.' : 'Context package received.';
        root.replaceChildren();
        const metrics = element('div');
        metrics.className = 'metrics';
        const metric = (value, label) => {
            const box = element('div', undefined, metrics);
            box.className = 'metric';
            element('strong', String(value), box);
            element('span', label, box);
        };
        metric(data.items, 'Selected records');
        const budget = receipt?.budget;
        const limits = [];
        if (integer(budget?.maxChars) && budget.maxChars > 0) limits.push(budget.maxChars);
        if (integer(budget?.maxTokens) && budget.maxTokens > 0) limits.push(budget.maxTokens * 4);
        metric(
            `${data.context.length} / ${limits.length ? Math.min(...limits) : 'not supplied'}`,
            'Actual characters / effective character limit',
        );
        metric(Math.ceil(data.context.length / 4), 'Estimated tokens (characters ÷ 4, rounded up)');
        element('p', 'Token estimate is for planning, not tokenizer output or billing.').className =
            'note';
        element('h2', 'Selected context metadata');
        if (!data.memories.length) element('p', 'No selected records.');
        const list = element('ul');
        for (const record of data.memories) {
            element(
                'li',
                [
                    record.scope || 'Scope not supplied',
                    `trust: ${record.sourceTrust || 'not supplied'}`,
                    `sensitivity: ${record.sensitivity || 'not supplied'}`,
                    `temporal: ${record.temporalStatus || 'not supplied'}`,
                ].join(' · '),
                list,
            );
        }
        const contextDetails = element('details');
        element('summary', 'Compiled context text', contextDetails);
        element('pre', data.context || '(Empty context)', contextDetails);
        const decisions = element('details');
        element('summary', 'Selection and skip reasons', decisions);
        const safe = receipt?.candidates?.filter((item) =>
            ['selected', 'skipped'].includes(item.decision),
        );
        if (!safe?.length) {
            element(
                'p',
                receipt
                    ? 'No selected or skipped explanations were supplied.'
                    : 'Explanation not supplied (for example, explain: false).',
                decisions,
            );
        } else {
            element('p', 'Policy-filtered selected and skipped records only.', decisions);
            const reasons = element('ul', undefined, decisions);
            for (const record of safe)
                element(
                    'li',
                    `${record.decision}: ${record.scope || 'scope not supplied'} · ${record.reason || 'reason not supplied'}`,
                    reasons,
                );
        }
        const proof = element('details');
        element('summary', 'Hashes and signature presence', proof);
        element(
            'p',
            `Context hash: ${data.contextHash || receipt?.contextHash || 'not supplied'}`,
            proof,
        );
        element('p', `Receipt hash: ${receipt?.receiptHash || 'not supplied'}`, proof);
        element(
            'p',
            `Context signature: ${receipt?.signature ? 'present' : 'not supplied'}. Receipt signature: ${receipt?.receiptSignature ? 'present' : 'not supplied'}.`,
            proof,
        );
        element(
            'p',
            'Signatures are not verified by this card. Hashes and metadata are host-supplied, not proof of authorization.',
            proof,
        );
        size();
    }
    function stop() {
        closed = true;
        early = null;
        clearTimeout(initTimer);
        clearTimeout(resultTimer);
        clearTimeout(resizeTimer);
        observer?.disconnect();
        window.removeEventListener('message', receive);
        window.removeEventListener('pagehide', stop);
    }
    function receive(event) {
        if (closed || event.source !== window.parent || !bounded(event.data)) return;
        const message = event.data;
        if (!object(message) || message.jsonrpc !== '2.0') return;
        if (message.method === undefined) {
            if (
                ready ||
                terminal ||
                message.id !== INIT_ID ||
                Object.hasOwn(message, 'result') === Object.hasOwn(message, 'error')
            )
                return;
            if (
                object(message.error) &&
                Number.isInteger(message.error.code) &&
                string(message.error.message)
            ) {
                finish('The MCP host could not initialize this card.');
                return;
            }
            const result = message.result;
            if (
                !object(result) ||
                result.protocolVersion !== VERSION ||
                !object(result.hostCapabilities) ||
                !object(result.hostInfo) ||
                !string(result.hostInfo.name, 256) ||
                !string(result.hostInfo.version, 256) ||
                (result.hostContext !== undefined && !object(result.hostContext))
            )
                return;
            clearTimeout(initTimer);
            ready = true;
            theme(result.hostContext);
            post({ method: 'ui/notifications/initialized' });
            status.textContent = 'Waiting for the context tool result…';
            resultTimer = setTimeout(
                () => finish('No context result arrived before the card timed out.'),
                60000,
            );
            if (typeof ResizeObserver !== 'undefined') {
                observer = new ResizeObserver(size);
                observer.observe(document.body);
            }
            size();
            if (early) {
                const buffered = early;
                early = null;
                render(buffered);
            }
            return;
        }
        if (
            !string(message.method, 128) ||
            Object.hasOwn(message, 'result') ||
            Object.hasOwn(message, 'error') ||
            (message.params !== undefined && !object(message.params))
        )
            return;
        if (
            message.method === 'ui/resource-teardown' &&
            id(message.id) &&
            (message.params?.reason === undefined || string(message.params.reason))
        ) {
            finish('Context card closed.');
            stop();
            post({ id: message.id, result: {} });
            return;
        }
        if (
            message.method === 'ping' &&
            ready &&
            id(message.id) &&
            (message.params === undefined || Object.keys(message.params).length === 0)
        ) {
            post({ id: message.id, result: {} });
            return;
        }
        if (Object.hasOwn(message, 'id')) return;
        if (message.method === 'ui/notifications/host-context-changed' && ready) {
            theme(message.params);
            return;
        }
        if (terminal) return;
        if (
            message.method === 'ui/notifications/tool-cancelled' &&
            (message.params?.reason === undefined || string(message.params.reason))
        ) {
            finish('Context compilation was cancelled. No receipt is available.');
            return;
        }
        if (
            message.method !== 'ui/notifications/tool-result' ||
            !object(message.params) ||
            (message.params.isError !== undefined && typeof message.params.isError !== 'boolean')
        )
            return;
        if (!ready) {
            // Keep at most one bounded early result; never render before initialization.
            if (!early) early = message.params;
            return;
        }
        render(message.params);
    }
    window.addEventListener('message', receive);
    window.addEventListener('pagehide', stop);
    const initTimer = setTimeout(
        () => finish('The MCP host did not initialize this card before the timeout.'),
        10000,
    );
    post({
        id: INIT_ID,
        method: 'ui/initialize',
        params: {
            appInfo: { name: 'OpenSelf context receipt', version: '1.0.0' },
            appCapabilities: { availableDisplayModes: ['inline'] },
            protocolVersion: VERSION,
        },
    });
})();
