const byId = (id) => document.getElementById(id);
let busy = false;
let poll;
let generation = 0;
let current = { status: 'disabled' };

for (const button of document.querySelectorAll('[data-open-view]'))
    button.addEventListener('click', () => {
        location.hash = button.dataset.openView;
    });
byId('app-add-memory').addEventListener('click', () => {
    location.hash = 'memories';
    byId('new-memory').click();
    byId('content').focus();
});

async function request(action, body = {}) {
    const response = await fetch(`/api/context/codex${action ? `/${action}` : ''}`, {
        method: action ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json' },
        ...(action ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Connection request failed.');
    return data;
}

function render(status) {
    current = status;
    const disabled = status.status === 'disabled';
    const pending = status.status === 'pending';
    const connected = status.status === 'connected';
    byId('codex-status').textContent =
        {
            disabled: 'Optional connection is off',
            disconnected: 'Not connected',
            connecting: 'Checking Codex…',
            pending: 'Waiting for sign-in',
            connected: 'Connected to Codex',
            error: 'Connection needs attention',
        }[status.status] || 'Not connected';
    byId('codex-help').textContent = disabled
        ? 'Launch openself app --codex to enable these controls. A separate sign-in consent is still required.'
        : 'Requires an installed Codex CLI. Checking status does not start a research or coding task.';
    byId('codex-controls').classList.toggle('hidden', disabled);
    byId('codex-sign-in').classList.toggle('hidden', connected || pending);
    byId('codex-cancel').classList.toggle('hidden', !pending);
    byId('codex-logout').classList.toggle('hidden', !connected);
    byId('codex-refresh').disabled = busy || pending;
    for (const id of ['codex-sign-in', 'codex-cancel', 'codex-logout']) byId(id).disabled = busy;
    const link = byId('codex-auth-link');
    link.removeAttribute('href');
    let safeUrl = null;
    try {
        const url = new URL(status.authUrl);
        if (
            url.protocol === 'https:' &&
            ['auth.openai.com', 'chatgpt.com'].includes(url.hostname) &&
            !url.username &&
            !url.password &&
            (!url.port || url.port === '443')
        )
            safeUrl = url.href;
    } catch {
        /* no pending authorization URL */
    }
    byId('codex-pending').classList.toggle('hidden', !pending || !safeUrl);
    if (pending && safeUrl) link.href = safeUrl;
    clearTimeout(poll);
    if (pending) poll = setTimeout(loadStatus, 1500);
}

function error(message) {
    byId('codex-error').textContent = message;
    byId('codex-error').classList.remove('hidden');
}
async function loadStatus() {
    const version = generation;
    try {
        const status = await request();
        if (version === generation && !busy) render(status);
    } catch {
        if (version === generation) {
            render({ status: 'error', authenticated: false });
            error('Cannot reach the local app. Check that it is still running.');
        }
    }
}
async function perform(action, body) {
    if (busy) return;
    busy = true;
    generation += 1;
    clearTimeout(poll);
    byId('codex-error').classList.add('hidden');
    render(current);
    try {
        const status = await request(action, body);
        busy = false;
        render(status);
    } catch (failure) {
        busy = false;
        render({ status: 'error', authenticated: false });
        error(failure.message);
    }
}
byId('codex-sign-in').addEventListener('click', () => byId('codex-consent').showModal());
byId('codex-consent-cancel').addEventListener('click', () => byId('codex-consent').close());
byId('codex-consent-confirm').addEventListener('click', () => {
    byId('codex-consent').close();
    void perform('login', { consent: true });
});
byId('codex-refresh').addEventListener('click', () => void perform('refresh'));
byId('codex-cancel').addEventListener('click', () => void perform('cancel'));
byId('codex-logout').addEventListener('click', () => {
    if (confirm('Disconnect the separate Codex session used by this OpenSelf vault?'))
        void perform('logout');
});
window.addEventListener('pagehide', () => {
    generation += 1;
    clearTimeout(poll);
});
window.addEventListener('pageshow', () => void loadStatus());
void loadStatus();
