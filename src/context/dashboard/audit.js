/* Audit view — local MCP access metadata (client, tool, outcome, time). */

async function refreshAudit() {
    const response = await fetch('/api/context/audit');
    const { events } = await response.json().catch(() => ({ events: [] }));
    const list = document.getElementById('audit-list');
    list.replaceChildren();
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
        list.append(row);
    }
}

// dashboard.js tab switching calls this after this script has loaded.
window.refreshAudit = refreshAudit;
