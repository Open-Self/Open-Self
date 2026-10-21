// Local owner-only context experiments. Never stores form data or sends it to a provider.
const labElement = (id) => document.getElementById(`lab-${id}`);
let labGeneration = 0;
let labController = null;
let labResult = null;

function labBusy(value) {
    labElement('run').disabled = value;
    labElement('import').disabled = value;
    labElement('cancel').classList.toggle('hidden', !value);
}
function clearLabResult() {
    labResult = null;
    labElement('results').classList.add('hidden');
    labElement('a-context').textContent = '';
    labElement('b-context').textContent = '';
    labElement('diff-list').replaceChildren();
    labElement('export-consent').close();
}
function cancelLab(message = 'Comparison cancelled. No vault data was changed.') {
    labGeneration++;
    labController?.abort();
    labController = null;
    labBusy(false);
    clearLabResult();
    labElement('status').textContent = message;
}
function labRequest(side) {
    const request = {
        query: labElement('query').value.trim(),
        retrieval: 'lexical',
        budget: { maxChars: Number(labElement(`${side}-chars`).value) },
    };
    for (const [field, key] of [
        ['scope', 'scope'],
        ['asof', 'asOf'],
    ]) {
        const value = labElement(`${side}-${field}`).value.trim();
        if (value) request[key] = value;
    }
    return request;
}
function renderLab(result) {
    labResult = result;
    labElement('results').classList.remove('hidden');
    labElement('baseline').textContent =
        `Frozen baseline ${result.baseline.revision} · as of ${result.baseline.asOf} · compiler ${result.baseline.compilerVersion}`;
    for (const side of ['a', 'b']) {
        const pkg = result[side];
        labElement(`${side}-context`).textContent = pkg.context || '(no matching context)';
        labElement(`${side}-stats`).textContent =
            `${pkg.items} selected · ${pkg.usedChars}/${pkg.receipt.budget.maxChars} characters (effective limit) · ~${pkg.usedTokens} estimated tokens · as of ${pkg.receipt.asOf} · scope ${pkg.receipt.filters.scope || 'all allowed'} · query ${pkg.query || '(all)'}`;
    }
    const diff = result.diff;
    labElement('diff-summary').textContent =
        `${diff.added.length} added · ${diff.removed.length} removed · ${diff.changed.length} changed · ${diff.unchanged.length} unchanged (A → B)`;
    const list = labElement('diff-list');
    list.replaceChildren();
    for (const item of diff.candidates) {
        const row = document.createElement('li');
        const describe = (value) =>
            value
                ? `${value.decision}: ${value.reason} · hash ${value.contentHash || 'not available'}`
                : 'not a candidate';
        row.textContent = `${item.id} · A ${describe(item.a)} → B ${describe(item.b)}`;
        list.append(row);
    }
    if (!diff.candidates.length) {
        const row = document.createElement('li');
        row.textContent = 'No matching candidates in either experiment.';
        list.append(row);
    }
}
async function compareLab(payload, expectedResults) {
    cancelLab('Comparing against one frozen vault baseline…');
    const generation = labGeneration;
    labController = new AbortController();
    labBusy(true);
    try {
        const response = await fetch('/api/context/lab/compare', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: labController.signal,
        });
        const result = await response.json();
        if (generation !== labGeneration) return;
        if (!response.ok) throw new Error(result.error || 'Comparison failed.');
        if (expectedResults) {
            for (const side of ['a', 'b']) {
                if (expectedResults[side]?.contextHash !== result[side].contextHash)
                    throw new Error(
                        'Replay mismatch: compiled context differs from the saved scenario.',
                    );
            }
        }
        renderLab(result);
        labElement('status').textContent = expectedResults
            ? 'Replay passed: same baseline and matching context hashes. Results use saved parameters; the form above is for your next comparison. No vault data was changed.'
            : 'Comparison complete. Same frozen baseline; no vault data was changed.';
    } catch (error) {
        if (generation !== labGeneration) return;
        clearLabResult();
        labElement('status').textContent =
            error.name === 'AbortError' ? 'Comparison cancelled.' : error.message;
    } finally {
        if (generation === labGeneration) {
            labController = null;
            labBusy(false);
        }
    }
}
labElement('form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (labController) return;
    void compareLab({ a: labRequest('a'), b: labRequest('b') });
});
labElement('form').addEventListener('input', () => {
    cancelLab('Parameters changed. Compare again to refresh the results.');
});
labElement('cancel').addEventListener('click', () => cancelLab());
window.addEventListener('hashchange', () => {
    if (location.hash !== '#lab') cancelLab();
});
labElement('export').addEventListener('click', () => {
    if (labResult) labElement('export-consent').showModal();
});
labElement('export-back').addEventListener('click', () => labElement('export-consent').close());
labElement('export-confirm').addEventListener('click', () => {
    if (!labResult) return;
    const blob = new Blob([JSON.stringify(labResult.scenario, null, 2) + '\n'], {
        type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'openself-context-scenario.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    labElement('export-consent').close();
});
labElement('import').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    cancelLab('Reading local scenario…');
    const generation = labGeneration;
    try {
        if (file.size > 64 * 1024) throw new Error('Scenario exceeds the 64 KB limit.');
        const scenario = JSON.parse(await file.text());
        if (generation !== labGeneration) return;
        if (
            scenario.kind !== 'openself-context-lab' ||
            scenario.version !== 1 ||
            !scenario.baseline ||
            !scenario.a ||
            !scenario.b ||
            !scenario.results
        )
            throw new Error('Not a supported OpenSelf Context Lab scenario.');
        // Do not apply imported parameters to the simpler form: it cannot represent every compiler option.
        await compareLab(
            { a: scenario.a, b: scenario.b, baseline: scenario.baseline },
            scenario.results,
        );
    } catch (error) {
        if (generation !== labGeneration) return;
        clearLabResult();
        labElement('status').textContent = error.message;
    }
});
