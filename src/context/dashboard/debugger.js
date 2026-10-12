/* Context Debugger view — compileContext receipts rendered in the dashboard. */

function debugApi(path) {
    return fetch(`/api/context${path}`).then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
        return body;
    });
}

async function runDebug() {
    const query = document.getElementById('debug-query').value.trim();
    if (!query) return;
    const params = new URLSearchParams({ q: query });
    const task = document.getElementById('debug-task').value.trim();
    if (task) params.set('task', task);
    const scope = document.getElementById('debug-scope').value.trim();
    if (scope) params.set('scope', scope);
    params.set('retrieval', document.getElementById('debug-retrieval').value);
    params.set('maxChars', document.getElementById('debug-chars').value || '8000');
    const trust = document.getElementById('debug-trust').value;
    if (trust) params.set('minSourceTrust', trust);
    const lifecycle = document.getElementById('debug-lifecycle').value;
    if (lifecycle === 'superseded' || lifecycle === 'all') params.set('includeSuperseded', 'true');
    if (lifecycle === 'stale' || lifecycle === 'all') params.set('includeStale', 'true');

    const result = await debugApi(`/debug?${params}`);
    document.getElementById('debug-empty').classList.add('hidden');
    document.getElementById('debug-results').classList.remove('hidden');
    document.getElementById('debug-context').textContent =
        result.context || '(no matching context)';

    const receipt = result.receipt;
    const requester = receipt?.requester ? ` · requester ${receipt.requester.clientId}` : '';
    document.getElementById('debug-meta').textContent = receipt
        ? `${receipt.totals.selected}/${receipt.totals.candidates} candidates selected · ` +
          `${receipt.totals.usedChars} chars · asOf ${receipt.asOf}${requester}` +
          (receipt.totals.denied ? ` · ${receipt.totals.denied} policy-denied` : '') +
          (receipt.totals.conflicts ? ` · ${receipt.totals.conflicts} conflicts` : '')
        : '';

    const rows = document.getElementById('receipt-rows');
    rows.replaceChildren();
    for (const candidate of receipt?.candidates || []) {
        const row = document.createElement('tr');
        row.className =
            candidate.decision === 'selected'
                ? 'row-selected'
                : candidate.decision === 'denied'
                  ? 'row-denied'
                  : 'row-skipped';
        const mark = document.createElement('td');
        mark.textContent =
            candidate.decision === 'selected' ? '✓' : candidate.decision === 'denied' ? '✕' : '–';
        const type = cell(candidate.type || '—');
        const scopeCell = cell(candidate.scope || '—');
        const trustCell = cell(
            candidate.sensitivity ? `${candidate.sensitivity} / ${candidate.sourceTrust}` : '—',
        );
        const matchParts = [
            candidate.match?.lexicalRank != null ? `lex #${candidate.match.lexicalRank}` : null,
            candidate.match?.vectorRank != null ? `vec #${candidate.match.vectorRank}` : null,
            candidate.match?.vectorSimilarity != null
                ? `sim ${candidate.match.vectorSimilarity}`
                : null,
        ]
            .filter(Boolean)
            .join(' · ');
        const match = cell(matchParts || '—');
        const recency = cell(candidate.recencyDays == null ? '—' : `${candidate.recencyDays}d ago`);
        const chars = cell(candidate.chars == null ? '—' : String(candidate.chars));
        const lifecycle =
            candidate.temporalStatus && candidate.temporalStatus !== 'current'
                ? `${candidate.decision} (${candidate.reason}; ${candidate.temporalStatus})`
                : `${candidate.decision} (${candidate.reason})`;
        const decision = cell(lifecycle);
        row.append(mark, type, scopeCell, trustCell, match, recency, chars, decision);
        row.title = candidate.id;
        rows.append(row);
    }
}

function cell(text) {
    const td = document.createElement('td');
    td.textContent = text;
    return td;
}

document.getElementById('debug-run').addEventListener('click', () => {
    runDebug().catch((error) => {
        document.getElementById('debug-meta').textContent = error.message;
    });
});
document.getElementById('debug-query').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        runDebug().catch((error) => {
            document.getElementById('debug-meta').textContent = error.message;
        });
    }
});
