/* Audit view — local MCP access metadata (client, tool, outcome, time). */

async function refreshAudit() {
    const response = await fetch('/api/context/audit');
    const { events, chain } = await response.json().catch(() => ({ events: [], chain: null }));
    const list = document.getElementById('audit-list');
    list.replaceChildren();
    renderChainStatus(list, chain);
    if (!events || !events.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-list';
        empty.textContent = 'No MCP access events yet.';
        list.append(empty);
        return;
    }
    for (const event of events) {
        const row = document.createElement('div');
        row.className = `audit-row outcome-${event.outcome}`;
        const time = document.createElement('span');
        time.className = 'audit-time';
        time.textContent = new Date(event.occurredAt).toLocaleString();
        const client = document.createElement('span');
        client.className = 'audit-client';
        client.textContent = event.client;
        const tool = document.createElement('span');
        tool.className = 'audit-tool';
        tool.textContent = event.tool;
        const outcome = document.createElement('span');
        outcome.className = `audit-outcome ${event.outcome}`;
        outcome.textContent = event.outcome;
        row.append(time, client, tool, outcome);
        if (event.entryHash) row.title = `chain ${event.entryHash.slice(0, 16)}…`;
        list.append(row);
    }
}

function renderChainStatus(list, chain) {
    if (!chain) return;
    const status = document.createElement('p');
    status.className = `audit-chain ${chain.ok ? 'chain-ok' : 'chain-broken'}`;
    status.textContent = chain.ok
        ? `Tamper-evident chain verified — ${chain.checked} event(s)` +
          (chain.legacy ? ` · ${chain.legacy} legacy` : '') +
          (chain.pending ? ` · ${chain.pending} pending` : '')
        : `Audit chain broken at event #${chain.brokenAt}`;
    list.append(status);
}

// dashboard.js tab switching calls this after this script has loaded.
window.refreshAudit = refreshAudit;
