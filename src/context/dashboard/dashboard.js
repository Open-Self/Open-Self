const $ = (id) => document.getElementById(id);
const state = { selectedId: null, creating: false, memories: [] };

const fields = {
    content: $('content'),
    type: $('type'),
    summary: $('summary'),
    scope: $('scope'),
    sensitivity: $('sensitivity'),
    confidence: $('confidence'),
    tags: $('tags'),
    sourceKind: $('source-kind'),
    sourceLocator: $('source-locator'),
    sourceTitle: $('source-title'),
    occurredAt: $('occurred-at'),
    validFrom: $('valid-from'),
    validTo: $('valid-to'),
};

async function api(path, options = {}) {
    const response = await fetch(`/api/context${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
    return body;
}

async function refresh() {
    const params = new URLSearchParams();
    if ($('search').value.trim()) params.set('q', $('search').value.trim());
    if ($('scope-filter').value.trim()) params.set('scope', $('scope-filter').value.trim());
    if ($('type-filter').value) params.set('type', $('type-filter').value);
    params.set('limit', '100');
    const [{ memories }, stats] = await Promise.all([api(`/memories?${params}`), api('/stats')]);
    state.memories = memories;
    $('active-count').textContent = stats.active;
    $('vector-count').textContent = stats.vectors;
    $('model-name').textContent = stats.vectorModel;
    renderMemories();
}

function renderMemories() {
    const list = $('memory-list');
    list.replaceChildren();
    if (!state.memories.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-list';
        empty.textContent = 'No memories found.';
        list.append(empty);
        return;
    }
    for (const memory of state.memories) {
        const card = document.createElement('article');
        card.className = `memory-card${memory.id === state.selectedId ? ' selected' : ''}`;
        card.tabIndex = 0;
        const top = document.createElement('div');
        top.className = 'memory-card-top';
        const type = document.createElement('span');
        type.className = 'memory-type';
        type.textContent = memory.type;
        const scope = document.createElement('span');
        scope.className = 'memory-scope';
        scope.textContent = memory.scope;
        const content = document.createElement('p');
        content.className = 'memory-content';
        content.textContent = memory.content;
        top.append(type, scope);
        card.append(top, content);
        card.addEventListener('click', () => selectMemory(memory.id));
        card.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') selectMemory(memory.id);
        });
        list.append(card);
    }
}

async function selectMemory(id) {
    try {
        const [{ memory }, { history }] = await Promise.all([
            api(`/memories/${encodeURIComponent(id)}`),
            api(`/memories/${encodeURIComponent(id)}/history`),
        ]);
        state.selectedId = id;
        state.creating = false;
        fillForm(memory);
        renderHistory(history);
        renderMemories();
    } catch (error) {
        showMessage(error.message, true);
    }
}

function fillForm(memory = {}) {
    $('empty-state').classList.add('hidden');
    $('memory-form').classList.remove('hidden');
    $('form-title').textContent = memory.id ? 'Edit memory' : 'New memory';
    $('memory-id').textContent = memory.id || 'Not saved yet';
    $('memory-status').textContent = memory.status || 'draft';
    fields.content.value = memory.content || '';
    fields.type.value = memory.type || 'note';
    fields.summary.value = memory.summary || '';
    fields.scope.value = memory.scope || 'personal';
    fields.sensitivity.value = memory.sensitivity || 'personal';
    fields.confidence.value = memory.confidence ?? 1;
    fields.tags.value = (memory.tags || []).join(', ');
    fields.sourceKind.value = memory.source?.kind || 'manual';
    fields.sourceLocator.value = memory.source?.locator || '';
    fields.sourceTitle.value = memory.source?.title || '';
    fields.occurredAt.value = toLocalInput(memory.occurredAt);
    fields.validFrom.value = toLocalInput(memory.validFrom);
    fields.validTo.value = toLocalInput(memory.validTo);
    $('forget-memory').classList.toggle('hidden', !memory.id);
    $('merge-section').classList.toggle('hidden', !memory.id);
    $('conflicts').classList.add('hidden');
    $('message').classList.add('hidden');
}

function payload() {
    return {
        content: fields.content.value.trim(),
        type: fields.type.value,
        summary: fields.summary.value.trim(),
        scope: fields.scope.value.trim(),
        sensitivity: fields.sensitivity.value,
        confidence: Number(fields.confidence.value),
        tags: fields.tags.value
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean),
        source: {
            kind: fields.sourceKind.value.trim() || 'manual',
            locator: fields.sourceLocator.value.trim(),
            title: fields.sourceTitle.value.trim(),
        },
        occurredAt: toIso(fields.occurredAt.value),
        validFrom: toIso(fields.validFrom.value),
        validTo: toIso(fields.validTo.value),
    };
}

async function save(event) {
    event.preventDefault();
    try {
        const path = state.creating
            ? '/memories'
            : `/memories/${encodeURIComponent(state.selectedId)}`;
        const result = await api(path, {
            method: state.creating ? 'POST' : 'PATCH',
            body: JSON.stringify(payload()),
        });
        state.selectedId = result.memory.id;
        state.creating = false;
        fillForm(result.memory);
        renderConflicts(result.potentialConflicts);
        await Promise.all([refresh(), loadHistory(result.memory.id)]);
        showMessage('Memory saved.');
    } catch (error) {
        showMessage(error.message, true);
    }
}

async function checkConflicts() {
    try {
        const result = await api('/conflicts', { method: 'POST', body: JSON.stringify(payload()) });
        renderConflicts(result.potentialConflicts);
    } catch (error) {
        showMessage(error.message, true);
    }
}

async function forgetMemory() {
    if (
        !state.selectedId ||
        !confirm('Forget this memory? It will leave normal retrieval but remain in history.')
    )
        return;
    try {
        await api(`/memories/${encodeURIComponent(state.selectedId)}`, { method: 'DELETE' });
        state.selectedId = null;
        fillEmpty();
        await refresh();
    } catch (error) {
        showMessage(error.message, true);
    }
}

async function mergeMemory() {
    const duplicateIds = $('duplicate-ids')
        .value.split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    if (!duplicateIds.length) return showMessage('Enter at least one duplicate memory ID.', true);
    try {
        const result = await api(`/memories/${encodeURIComponent(state.selectedId)}/merge`, {
            method: 'POST',
            body: JSON.stringify({ duplicateIds }),
        });
        $('duplicate-ids').value = '';
        fillForm(result.memory);
        await Promise.all([refresh(), loadHistory(result.memory.id)]);
        showMessage(`Merged ${result.mergedIds.length} duplicate(s).`);
    } catch (error) {
        showMessage(error.message, true);
    }
}

async function loadHistory(id) {
    const { history } = await api(`/memories/${encodeURIComponent(id)}/history`);
    renderHistory(history);
}
function renderHistory(history) {
    const list = $('history-list');
    list.replaceChildren();
    for (const version of history) {
        const item = document.createElement('div');
        item.className = 'history-item';
        const title = document.createElement('strong');
        title.textContent = `v${version.version} · ${version.changeKind}`;
        const time = document.createElement('span');
        time.textContent = new Date(version.changedAt).toLocaleString();
        const content = document.createElement('span');
        content.textContent = version.snapshot.content;
        item.append(title, time, content);
        list.append(item);
    }
}
function renderConflicts(conflicts = []) {
    const box = $('conflicts');
    if (!conflicts.length) {
        box.classList.add('hidden');
        return;
    }
    box.textContent =
        `Potential conflicts (${conflicts.length})\n` +
        conflicts
            .map((item) => `• ${item.content} [${item.scope}] · similarity ${item.similarity}`)
            .join('\n');
    box.classList.remove('hidden');
}
function showMessage(text, error = false) {
    const box = $('message');
    box.textContent = text;
    box.className = `message${error ? ' error' : ''}`;
}
function fillEmpty() {
    $('memory-form').classList.add('hidden');
    $('empty-state').classList.remove('hidden');
}
function toLocalInput(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? ''
        : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function toIso(value) {
    return value ? new Date(value).toISOString() : undefined;
}

$('memory-form').addEventListener('submit', save);
$('new-memory').addEventListener('click', () => {
    state.selectedId = null;
    state.creating = true;
    fillForm();
    renderHistory([]);
});
$('check-conflicts').addEventListener('click', checkConflicts);
$('forget-memory').addEventListener('click', forgetMemory);
$('merge-memory').addEventListener('click', mergeMemory);
let refreshTimer;
for (const id of ['search', 'scope-filter', 'type-filter'])
    $(id).addEventListener('input', () => {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(
            () => refresh().catch((error) => showMessage(error.message, true)),
            180,
        );
    });
refresh().catch((error) => showMessage(error.message, true));
