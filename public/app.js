// Frontend controller: builds the dropdowns, runs the SSE pipeline, renders progress,
// and triggers the PDF download. Vanilla JS, no dependencies.

(() => {
  'use strict';

  const form = document.getElementById('finder-form');
  const fieldsEl = document.getElementById('fields');
  const fieldsLoading = document.getElementById('fields-loading');
  const submitBtn = document.getElementById('submit');
  const resetBtn = document.getElementById('reset');
  const keypreview = document.getElementById('keypreview');
  const keypreviewValue = document.getElementById('keypreview-value');
  const keypreviewCopy = document.getElementById('keypreview-copy');
  const progressPanel = document.getElementById('progress-panel');
  const stepsEl = document.getElementById('steps');
  const resultEl = document.getElementById('result');
  const resultMessage = document.getElementById('result-message');
  const downloadLink = document.getElementById('download-link');
  const errorEl = document.getElementById('error');
  const errorMessage = document.getElementById('error-message');

  // Ordered steps shown in the progress checklist.
  const STEP_DEFS = [
    { id: 'validating', title: 'Validate specification' },
    { id: 'key', title: 'Build configuration' },
    { id: 'preparing', title: 'Prepare scratch workspace' },
    { id: 'configuring', title: 'Apply configuration to drawing' },
    { id: 'exporting', title: 'Request PDF export' },
    { id: 'polling', title: 'Wait for export to finish' },
    { id: 'downloading', title: 'Download PDF' },
  ];

  let fieldIds = [];
  let activeSource = null;

  // --- Dropdown construction --------------------------------------------------

  async function loadOptions() {
    try {
      const res = await fetch('/api/options');
      if (!res.ok) throw new Error(`Failed to load options (${res.status}).`);
      const data = await res.json();
      renderFields(data.fields || []);
    } catch (err) {
      fieldsLoading.textContent = `Could not load options: ${err.message}`;
    }
  }

  function renderFields(fields) {
    fieldsLoading.remove();
    fieldIds = fields.map((f) => f.id);

    for (const field of fields) {
      const wrap = document.createElement('div');
      wrap.className = 'field';

      const label = document.createElement('label');
      label.className = 'field__label';
      label.setAttribute('for', `field-${field.id}`);
      label.textContent = field.label;

      const select = document.createElement('select');
      select.className = 'field__select';
      select.id = `field-${field.id}`;
      select.name = field.id;
      select.required = true;

      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = `Select ${field.label.toLowerCase()}…`;
      placeholder.disabled = true;
      placeholder.selected = true;
      select.appendChild(placeholder);

      for (const value of field.options) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = value;
        select.appendChild(opt);
      }

      select.addEventListener('change', updateSubmitState);
      wrap.append(label, select);
      fieldsEl.appendChild(wrap);
    }
    updateSubmitState();
  }

  function getSelection() {
    const selection = {};
    for (const id of fieldIds) {
      const el = document.getElementById(`field-${id}`);
      selection[id] = el ? el.value : '';
    }
    return selection;
  }

  function isComplete() {
    return fieldIds.length > 0 && fieldIds.every((id) => getSelection()[id]);
  }

  function updateSubmitState() {
    submitBtn.disabled = !isComplete();
    updateKeyPreview();
  }

  // Show the deterministic drawing key live once all four fields are chosen, so the user
  // knows exactly what to name the matching Onshape drawing.
  async function updateKeyPreview() {
    if (!isComplete()) {
      keypreview.hidden = true;
      return;
    }
    try {
      const params = new URLSearchParams(getSelection());
      const res = await fetch(`/api/key?${params.toString()}`);
      const data = await res.json();
      if (data.complete && data.key) {
        keypreviewValue.textContent = data.key;
        keypreview.hidden = false;
      } else {
        keypreview.hidden = true;
      }
    } catch {
      keypreview.hidden = true;
    }
  }

  if (keypreviewCopy) {
    keypreviewCopy.addEventListener('click', async () => {
      const key = keypreviewValue.textContent || '';
      try {
        await navigator.clipboard.writeText(key);
        keypreviewCopy.textContent = 'Copied';
        setTimeout(() => {
          keypreviewCopy.textContent = 'Copy';
        }, 1200);
      } catch {
        /* clipboard unavailable; ignore */
      }
    });
  }

  // --- Progress rendering -----------------------------------------------------

  function renderSteps() {
    stepsEl.innerHTML = '';
    for (const def of STEP_DEFS) {
      const li = document.createElement('li');
      li.className = 'step';
      li.id = `step-${def.id}`;
      li.innerHTML = `
        <span class="step__icon" aria-hidden="true"></span>
        <span class="step__body">
          <span class="step__title">${def.title}</span>
          <span class="step__detail"></span>
        </span>`;
      stepsEl.appendChild(li);
    }
  }

  const STATE_ICON = { active: '', done: '✓', error: '✕' };

  function setStep(stepId, status, detail) {
    const li = document.getElementById(`step-${stepId}`);
    if (!li) return;
    li.classList.remove('step--active', 'step--done', 'step--error');
    if (status) li.classList.add(`step--${status}`);
    const icon = li.querySelector('.step__icon');
    if (icon) icon.textContent = STATE_ICON[status] ?? '';
    if (detail !== undefined) {
      const detailEl = li.querySelector('.step__detail');
      if (detailEl) detailEl.textContent = detail;
    }
  }

  function markRemainingError() {
    for (const def of STEP_DEFS) {
      const li = document.getElementById(`step-${def.id}`);
      if (li && li.classList.contains('step--active')) {
        setStep(def.id, 'error');
      }
    }
  }

  // --- Pipeline ---------------------------------------------------------------

  function startPipeline(selection) {
    closeSource();
    resetPanels();
    renderSteps();
    progressPanel.hidden = false;
    resetBtn.hidden = false;
    submitBtn.disabled = true;

    const params = new URLSearchParams(selection);
    const source = new EventSource(`/api/finder/stream?${params.toString()}`);
    activeSource = source;

    source.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      let detail = data.message || '';
      if (data.step === 'key' && data.configuration) {
        detail = `${data.key}  ·  config: ${data.configuration}`;
      }
      setStep(data.step, data.status, detail);
    });

    source.addEventListener('done', (e) => {
      const data = JSON.parse(e.data);
      closeSource();
      showResult(data);
      submitBtn.disabled = false;
    });

    source.addEventListener('error', (e) => {
      // Distinguish an application error event (has data) from a transport drop.
      const data = safeParse(e.data);
      closeSource();
      markRemainingError();
      if (data && data.message) {
        showError(data.message);
      } else {
        showError('The connection to the server was lost. Please try again.');
      }
      submitBtn.disabled = false;
    });
  }

  function showResult(data) {
    resultMessage.textContent = `${data.message} (${data.filename})`;
    downloadLink.href = data.downloadUrl;
    downloadLink.setAttribute('download', data.filename || 'drawing.pdf');
    resultEl.hidden = false;
    // Auto-trigger the download for convenience.
    triggerDownload(data.downloadUrl, data.filename);
  }

  function triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    if (filename) a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function showError(message) {
    errorMessage.textContent = message;
    errorEl.hidden = false;
  }

  function resetPanels() {
    resultEl.hidden = true;
    errorEl.hidden = true;
    errorMessage.textContent = '';
    resultMessage.textContent = '';
  }

  function closeSource() {
    if (activeSource) {
      activeSource.close();
      activeSource = null;
    }
  }

  function safeParse(text) {
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  }

  // --- Events -----------------------------------------------------------------

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isComplete()) return;
    startPipeline(getSelection());
  });

  resetBtn.addEventListener('click', () => {
    closeSource();
    form.reset();
    progressPanel.hidden = true;
    resetBtn.hidden = true;
    resetPanels();
    updateSubmitState();
  });

  loadOptions();
})();
