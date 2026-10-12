/* Memory Inbox view — owner review of agent-proposed memories. */

function inboxApi(path, options = {}) {
    return fetch(`/api/context${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    }).then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
        return body;
    });
}

async function refreshInbox() {
    const status = document.getElementById('inbox-status').value;
    const { proposals } = await inboxApi(`/proposals?status=${status}`);
    const list = document.getElementById('proposal-list');
    list.replaceChildren();
    if (!proposals.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-list';
        empty.textContent = `No ${status === 'all' ? '' : `${status} `}proposals.`;
        list.append(empty);
        return;
    }
    for (const proposal of proposals) list.append(renderProposal(proposal));
}

function renderProposal(proposal) {
    const memory = proposal.memory;
    const card = document.createElement('article');
    card.className = 'proposal-card';

    const top = document.createElement('div');
    top.className = 'memory-card-top';
    const badge = document.createElement('span');
    badge.className = 'memory-type';
    badge.textContent = `${memory.type} · ${proposal.proposedBy}`;
    const meta = document.createElement('span');
    meta.className = 'memory-scope';
    meta.textContent = `${memory.scope} · ${memory.sensitivity} · trust ${memory.sourceTrust}`;
    top.append(badge, meta);

    const content = document.createElement('p');
    content.className = 'proposal-content';
    content.textContent = memory.content;

    const provenance = document.createElement('p');
    provenance.className = 'hint';
    const sourceLabel =
        memory.source?.title || memory.source?.locator || memory.source?.kind || 'unknown';
    provenance.textContent =
        `proposed ${new Date(proposal.proposedAt).toLocaleString()} · source: ${sourceLabel}` +
        (proposal.note ? ` · note: ${proposal.note}` : '');

    card.append(top, content, provenance);

    if (proposal.status === 'pending') {
        const noteInput = document.createElement('input');
        noteInput.placeholder = 'Review note (optional)';
        noteInput.className = 'review-note';
        const actions = document.createElement('div');
        actions.className = 'actions';
        const approve = document.createElement('button');
        approve.className = 'primary';
        approve.type = 'button';
        approve.textContent = 'Approve';
        approve.addEventListener('click', () =>
            resolveProposal(proposal.id, 'approve', noteInput.value),
        );
        const approveVerified = document.createElement('button');
        approveVerified.type = 'button';
        approveVerified.textContent = 'Approve as verified';
        approveVerified.title = 'Approve and raise source trust to verified';
        approveVerified.addEventListener('click', () =>
            resolveProposal(proposal.id, 'approve', noteInput.value, {
                sourceTrust: 'verified',
            }),
        );
        const reject = document.createElement('button');
        reject.type = 'button';
        reject.className = 'danger';
        reject.textContent = 'Reject';
        reject.addEventListener('click', () =>
            resolveProposal(proposal.id, 'reject', noteInput.value),
        );
        actions.append(approve, approveVerified, reject);
        card.append(noteInput, actions);
    } else {
        const resolved = document.createElement('p');
        resolved.className = 'hint';
        resolved.textContent =
            `${proposal.status} ${proposal.reviewedAt ? new Date(proposal.reviewedAt).toLocaleString() : ''}` +
            (proposal.reviewNote ? ` · ${proposal.reviewNote}` : '');
        card.append(resolved);
    }
    return card;
}

async function resolveProposal(id, action, reviewNote, overrides) {
    try {
        await inboxApi(`/proposals/${encodeURIComponent(id)}/${action}`, {
            method: 'POST',
            body: JSON.stringify({ reviewNote: reviewNote || '', overrides }),
        });
        await Promise.all([refreshInbox(), refreshInboxBadge()]);
    } catch (error) {
        alert(error.message);
    }
}

async function refreshInboxBadge() {
    try {
        const { proposals } = await inboxApi('/proposals?status=pending&limit=100');
        const badge = document.getElementById('inbox-count');
        badge.textContent = String(proposals.length);
        badge.classList.toggle('hidden', proposals.length === 0);
    } catch {
        /* badge is best-effort */
    }
}

document.getElementById('inbox-status').addEventListener('change', () => {
    refreshInbox().catch(() => {});
});
refreshInboxBadge().catch(() => {});

// dashboard.js tab switching calls these after this script has loaded.
window.refreshInbox = refreshInbox;
window.refreshInboxBadge = refreshInboxBadge;
