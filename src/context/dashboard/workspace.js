// Deliberately mock-only. No live transport, account, model, shell or external request.
const ws = (name) => document.getElementById(`workspace-${name}`);
let workspaceGeneration = 0;
let workspacePreview = null;
let workspaceRun = null;
let workspaceBusy = false;
let workspaceTimer;

async function workspaceApi(path, body) {
    const response = await fetch(`/api/context/workspace${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Workspace rehearsal failed.');
    return result;
}
function workspaceSetBusy(value) {
    workspaceBusy = value;
    for (const name of [
        'preview',
        'start',
        'consent-confirm',
        'proposal-approve',
        'proposal-reject',
    ])
        ws(name).disabled = value;
}
function workspaceReset(message) {
    workspaceGeneration++;
    clearTimeout(workspaceTimer);
    if (workspaceRun?.state === 'running')
        void workspaceApi(`/runs/${encodeURIComponent(workspaceRun.id)}/cancel`, {}).catch(
            () => {},
        );
    workspacePreview = null;
    workspaceRun = null;
    workspaceSetBusy(false);
    ws('consent').close();
    ws('start').classList.remove('hidden');
    ws('package').classList.add('hidden');
    ws('run').classList.add('hidden');
    ws('context').textContent = '';
    ws('output').textContent = '';
    ws('status').textContent = message;
}
function workspaceRender(run) {
    workspaceRun = run;
    ws('run').classList.remove('hidden');
    ws('run-state').textContent = `Simulation ${run.state}. No real agent task has run.`;
    ws('output').textContent = run.output || '(waiting for mock events)';
    ws('cancel').classList.toggle('hidden', run.state !== 'running');
    ws('proposal').classList.toggle('hidden', !run.proposal);
    if (run.proposal) {
        ws('proposal-text').textContent = run.proposal.content;
        ws('proposal-state').textContent =
            `Mock proposal: ${run.proposal.state}. Not saved to vault.`;
        for (const action of ['approve', 'reject'])
            ws(`proposal-${action}`).classList.toggle('hidden', run.proposal.state !== 'pending');
    }
}
async function workspacePoll(generation) {
    if (generation !== workspaceGeneration || !workspaceRun) return;
    try {
        const { run } = await workspaceApi(`/runs/${encodeURIComponent(workspaceRun.id)}`);
        if (generation !== workspaceGeneration) return;
        workspaceRender(run);
        if (run.state === 'running')
            workspaceTimer = setTimeout(() => void workspacePoll(generation), 250);
    } catch (error) {
        if (generation === workspaceGeneration) ws('status').textContent = error.message;
    }
}
ws('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (workspaceBusy) return;
    workspaceReset('Compiling a local preview. Nothing is sent to a model.');
    const generation = workspaceGeneration;
    workspaceSetBusy(true);
    try {
        const request = { task: ws('task').value.trim(), maxChars: Number(ws('chars').value) };
        if (ws('scope').value.trim()) request.scope = ws('scope').value.trim();
        const preview = await workspaceApi('/preview', request);
        if (generation !== workspaceGeneration) return;
        workspacePreview = preview;
        ws('package').classList.remove('hidden');
        ws('context').textContent = preview.context.context || '(no matching context)';
        ws('receipt').textContent =
            `${preview.context.items} selected · ${preview.context.usedChars} characters · hash ${preview.contextHash} · expires ${new Date(preview.expiresAt).toISOString()}`;
        ws('status').textContent =
            'Preview ready. Review exact context before consenting to the simulation.';
    } catch (error) {
        if (generation === workspaceGeneration) ws('status').textContent = error.message;
    } finally {
        if (generation === workspaceGeneration) workspaceSetBusy(false);
    }
});
ws('form').addEventListener('input', () =>
    workspaceReset('Task parameters changed. Build a fresh preview.'),
);
ws('start').addEventListener('click', () => {
    if (workspacePreview && !workspaceBusy) ws('consent').showModal();
});
ws('consent-back').addEventListener('click', () => ws('consent').close());
ws('consent-confirm').addEventListener('click', async () => {
    if (!workspacePreview || workspaceBusy) return;
    const generation = workspaceGeneration;
    workspaceSetBusy(true);
    ws('consent').close();
    // Consume this UI consent before sending; an uncertain response must not
    // silently enable a second start. The user can build a fresh preview.
    const approvedPreview = workspacePreview;
    workspacePreview = null;
    ws('start').classList.add('hidden');
    try {
        const { run } = await workspaceApi('/start', {
            previewId: approvedPreview.previewId,
            contextHash: approvedPreview.contextHash,
            consent: true,
        });
        if (generation !== workspaceGeneration) {
            if (run.state === 'running')
                await workspaceApi(`/runs/${encodeURIComponent(run.id)}/cancel`, {});
            return;
        }
        workspacePreview = null;
        ws('start').classList.add('hidden');
        workspaceRender(run);
        ws('status').textContent =
            'Local simulation started. No Codex or model connection is used.';
        void workspacePoll(generation);
    } catch (error) {
        if (generation === workspaceGeneration) ws('status').textContent = error.message;
    } finally {
        if (generation === workspaceGeneration) workspaceSetBusy(false);
    }
});
ws('cancel').addEventListener('click', async () => {
    if (!workspaceRun || workspaceBusy) return;
    // Invalidate any in-flight poll before applying the cancellation response.
    const generation = ++workspaceGeneration;
    clearTimeout(workspaceTimer);
    workspaceSetBusy(true);
    try {
        const { run } = await workspaceApi(
            `/runs/${encodeURIComponent(workspaceRun.id)}/cancel`,
            {},
        );
        if (generation === workspaceGeneration) workspaceRender(run);
    } catch (error) {
        if (generation === workspaceGeneration) ws('status').textContent = error.message;
    } finally {
        if (generation === workspaceGeneration) workspaceSetBusy(false);
    }
});
for (const decision of ['approve', 'reject']) {
    ws(`proposal-${decision}`).addEventListener('click', async () => {
        if (!workspaceRun || workspaceBusy) return;
        const generation = workspaceGeneration;
        workspaceSetBusy(true);
        try {
            const { run } = await workspaceApi(
                `/runs/${encodeURIComponent(workspaceRun.id)}/proposal`,
                { decision },
            );
            if (generation === workspaceGeneration) workspaceRender(run);
        } catch (error) {
            if (generation === workspaceGeneration) ws('status').textContent = error.message;
        } finally {
            if (generation === workspaceGeneration) workspaceSetBusy(false);
        }
    });
}
window.addEventListener('hashchange', () => {
    if (location.hash !== '#rehearsal')
        workspaceReset('Live execution unavailable. This is a local control-flow rehearsal.');
});
