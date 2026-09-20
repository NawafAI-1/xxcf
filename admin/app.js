// Vanilla JS admin UI — no build step. Talks to the local admin-server.mjs
// JSON API. Keep these enum lists in sync with src/lib/types.ts.
const DOMAINS = ['environmental', 'ecological', 'production', 'nutrition-health', 'socio-economic'];
const SUBBASINS = ['northern', 'central', 'southern', 'gulf-of-aqaba', 'farasan'];
const ACCESS_TIERS = ['public', 'kaust-internal', 'restricted', 'embargoed'];
const QUALITY_STATUSES = ['raw', 'cleaned', 'analysis-ready', 'deprecated'];
const FREQUENCIES = ['once', 'daily', 'monthly', 'annual', 'irregular'];

const app = document.getElementById('app');

const emptySource = () => ({
  id: '',
  title: '',
  abstract: '',
  domain: [],
  themes: [],
  keywords: [],
  spatial: { bbox: [0, 0, 0, 0], subbasins: [], resolution: '', geometry_file: '' },
  temporal: { start: '', end: '', frequency: 'once', ongoing: false },
  resources: [],
  access: { tier: 'public', steward: { name: '', email: '' }, how_to_request: '' },
  provenance: { originator: '', license: '', citation: '', doi: '', source_url: '', derived_from: [] },
  quality: { status: 'raw', known_issues: [], last_verified: '' },
  used_in: [],
});

async function apiList() {
  const res = await fetch('/api/sources');
  return res.json();
}

async function apiCreate(source) {
  const res = await fetch('/api/sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(source),
  });
  return { ok: res.ok, data: await res.json() };
}

async function apiUpdate(id, source) {
  const res = await fetch(`/api/sources/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(source),
  });
  return { ok: res.ok, data: await res.json() };
}

async function apiDelete(id) {
  const res = await fetch(`/api/sources/${id}`, { method: 'DELETE' });
  return res.ok;
}

function linesToArray(text) {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function csvToArray(text) {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child) node.appendChild(child);
  }
  return node;
}

async function renderList() {
  app.innerHTML = '';
  const sources = await apiList();

  const toolbar = el('div', { class: 'toolbar' }, [
    el('span', { text: `${sources.length} source${sources.length === 1 ? '' : 's'}` }),
    (() => {
      const btn = el('button', { class: 'primary', text: '+ New Source' });
      btn.addEventListener('click', () => renderForm(null));
      return btn;
    })(),
  ]);

  const table = el('table');
  table.appendChild(
    el('thead', {}, [
      el('tr', {}, [
        el('th', { text: 'ID' }),
        el('th', { text: 'Title' }),
        el('th', { text: 'Domain' }),
        el('th', { text: 'Quality' }),
        el('th', { text: '' }),
      ]),
    ])
  );
  const tbody = el('tbody');
  for (const s of sources) {
    const editBtn = el('button', { text: 'Edit' });
    editBtn.addEventListener('click', () => renderForm(s));
    const delBtn = el('button', { class: 'danger', text: 'Delete' });
    delBtn.addEventListener('click', async () => {
      if (!confirm(`Delete "${s.title}"? This removes data/sources/${s.id}.json.`)) return;
      await apiDelete(s.id);
      renderList();
    });
    tbody.appendChild(
      el('tr', {}, [
        el('td', { text: s.id }),
        el('td', { text: s.title }),
        el('td', { text: (s.domain || []).join(', ') }),
        el('td', { text: s.quality?.status ?? '' }),
        el('td', { class: 'row-actions' }, [editBtn, delBtn]),
      ])
    );
  }
  table.appendChild(tbody);

  app.appendChild(toolbar);
  app.appendChild(table);
}

function checkboxGroup(name, options, selected) {
  const group = el('div', { class: 'checkbox-group' });
  for (const opt of options) {
    const input = el('input', { type: 'checkbox', name, value: opt });
    if (selected.includes(opt)) input.setAttribute('checked', 'checked');
    const label = el('label', {}, [input, document.createTextNode(opt)]);
    group.appendChild(label);
  }
  return group;
}

function getCheckedValues(form, name) {
  return Array.from(form.querySelectorAll(`input[name="${name}"]:checked`)).map((i) => i.value);
}

function select(name, options, value) {
  const sel = el('select', { name });
  for (const opt of options) {
    const o = el('option', { value: opt, text: opt });
    if (opt === value) o.setAttribute('selected', 'selected');
    sel.appendChild(o);
  }
  return sel;
}

function renderForm(existing) {
  app.innerHTML = '';
  const isEdit = Boolean(existing);
  const source = existing ? JSON.parse(JSON.stringify(existing)) : emptySource();

  const form = el('form');
  const errorsBox = el('div', { class: 'errors', style: 'display:none' });
  form.appendChild(errorsBox);

  // --- Core ---
  const core = el('fieldset', {}, [el('legend', { text: 'Core' })]);
  core.appendChild(el('label', { text: 'ID (slug, immutable once created)' }));
  const idInput = el('input', { type: 'text', name: 'id', value: source.id, placeholder: 'e.g. crw-sst-rasters' });
  if (isEdit) idInput.setAttribute('disabled', 'disabled');
  core.appendChild(idInput);

  core.appendChild(el('label', { text: 'Title' }));
  const titleInput = el('input', { type: 'text', name: 'title', value: source.title });
  core.appendChild(titleInput);

  core.appendChild(el('label', { text: 'Abstract' }));
  const abstractInput = el('textarea', { name: 'abstract', rows: 3 });
  abstractInput.value = source.abstract;
  core.appendChild(abstractInput);

  core.appendChild(el('label', { text: 'Domain (one or more)' }));
  core.appendChild(checkboxGroup('domain', DOMAINS, source.domain));

  core.appendChild(el('label', { text: 'Themes (one per line)' }));
  const themesInput = el('textarea', { name: 'themes', rows: 2 });
  themesInput.value = source.themes.join('\n');
  core.appendChild(themesInput);

  core.appendChild(el('label', { text: 'Keywords (one per line)' }));
  const keywordsInput = el('textarea', { name: 'keywords', rows: 2 });
  keywordsInput.value = source.keywords.join('\n');
  core.appendChild(keywordsInput);
  form.appendChild(core);

  // --- Spatial ---
  const spatial = el('fieldset', {}, [el('legend', { text: 'Spatial' })]);
  spatial.appendChild(el('label', { text: 'Bounding box: West, South, East, North' }));
  const bboxRow = el('div', { class: 'grid-2' });
  const bboxInputs = source.spatial.bbox.map((v, i) =>
    el('input', { type: 'number', step: 'any', name: `bbox${i}`, value: v })
  );
  bboxInputs.forEach((inp) => bboxRow.appendChild(inp));
  spatial.appendChild(bboxRow);

  spatial.appendChild(el('label', { text: 'Subbasins' }));
  spatial.appendChild(checkboxGroup('subbasins', SUBBASINS, source.spatial.subbasins));

  spatial.appendChild(el('label', { text: 'Resolution' }));
  const resolutionInput = el('input', { type: 'text', name: 'resolution', value: source.spatial.resolution });
  spatial.appendChild(resolutionInput);

  spatial.appendChild(el('label', { text: 'Geometry file (optional, /geo/...)' }));
  const geometryInput = el('input', { type: 'text', name: 'geometry_file', value: source.spatial.geometry_file || '' });
  spatial.appendChild(geometryInput);
  form.appendChild(spatial);

  // --- Temporal ---
  const temporal = el('fieldset', {}, [el('legend', { text: 'Temporal' })]);
  const temporalRow = el('div', { class: 'grid-2' });
  const startWrap = el('div');
  startWrap.appendChild(el('label', { text: 'Start (YYYY or YYYY-MM)' }));
  const startInput = el('input', { type: 'text', name: 'start', value: source.temporal.start });
  startWrap.appendChild(startInput);
  const endWrap = el('div');
  endWrap.appendChild(el('label', { text: 'End' }));
  const endInput = el('input', { type: 'text', name: 'end', value: source.temporal.end });
  endWrap.appendChild(endInput);
  temporalRow.appendChild(startWrap);
  temporalRow.appendChild(endWrap);
  temporal.appendChild(temporalRow);

  temporal.appendChild(el('label', { text: 'Frequency' }));
  const frequencySelect = select('frequency', FREQUENCIES, source.temporal.frequency);
  temporal.appendChild(frequencySelect);

  const ongoingLabel = el('label', {}, [
    (() => {
      const cb = el('input', { type: 'checkbox', name: 'ongoing' });
      if (source.temporal.ongoing) cb.setAttribute('checked', 'checked');
      return cb;
    })(),
    document.createTextNode(' Ongoing'),
  ]);
  temporal.appendChild(ongoingLabel);
  form.appendChild(temporal);

  // --- Resources (raw JSON editor — arbitrarily nested) ---
  const resources = el('fieldset', {}, [el('legend', { text: 'Resources (raw JSON array)' })]);
  resources.appendChild(
    el('p', { class: 'hint', text: 'Each resource: { name, format, path, size, n_rows, variables: [{ name, label, type, unit, description, missing_values: [], maps_to: [] }] }' })
  );
  const resourcesInput = el('textarea', { name: 'resources', rows: 10 });
  resourcesInput.value = JSON.stringify(source.resources, null, 2);
  resources.appendChild(resourcesInput);
  form.appendChild(resources);

  // --- Access ---
  const access = el('fieldset', {}, [el('legend', { text: 'Access' })]);
  access.appendChild(el('label', { text: 'Tier' }));
  access.appendChild(select('tier', ACCESS_TIERS, source.access.tier));

  const stewardRow = el('div', { class: 'grid-2' });
  const stewardNameWrap = el('div');
  stewardNameWrap.appendChild(el('label', { text: 'Steward name' }));
  const stewardName = el('input', { type: 'text', name: 'steward_name', value: source.access.steward.name });
  stewardNameWrap.appendChild(stewardName);
  const stewardEmailWrap = el('div');
  stewardEmailWrap.appendChild(el('label', { text: 'Steward email' }));
  const stewardEmail = el('input', { type: 'email', name: 'steward_email', value: source.access.steward.email });
  stewardEmailWrap.appendChild(stewardEmail);
  stewardRow.appendChild(stewardNameWrap);
  stewardRow.appendChild(stewardEmailWrap);
  access.appendChild(stewardRow);

  access.appendChild(el('label', { text: 'How to request' }));
  const howToRequest = el('textarea', { name: 'how_to_request', rows: 2 });
  howToRequest.value = source.access.how_to_request;
  access.appendChild(howToRequest);
  form.appendChild(access);

  // --- Provenance ---
  const provenance = el('fieldset', {}, [el('legend', { text: 'Provenance' })]);
  provenance.appendChild(el('label', { text: 'Originator' }));
  const originatorInput = el('input', { type: 'text', name: 'originator', value: source.provenance.originator });
  provenance.appendChild(originatorInput);

  provenance.appendChild(el('label', { text: 'License' }));
  const licenseInput = el('input', { type: 'text', name: 'license', value: source.provenance.license ?? '' });
  provenance.appendChild(licenseInput);

  provenance.appendChild(el('label', { text: 'Citation' }));
  const citationInput = el('textarea', { name: 'citation', rows: 2 });
  citationInput.value = source.provenance.citation ?? '';
  provenance.appendChild(citationInput);

  const provRow = el('div', { class: 'grid-2' });
  const doiWrap = el('div');
  doiWrap.appendChild(el('label', { text: 'DOI (optional)' }));
  const doiInput = el('input', { type: 'text', name: 'doi', value: source.provenance.doi || '' });
  doiWrap.appendChild(doiInput);
  const urlWrap = el('div');
  urlWrap.appendChild(el('label', { text: 'Source URL (optional)' }));
  const urlInput = el('input', { type: 'text', name: 'source_url', value: source.provenance.source_url || '' });
  urlWrap.appendChild(urlInput);
  provRow.appendChild(doiWrap);
  provRow.appendChild(urlWrap);
  provenance.appendChild(provRow);

  provenance.appendChild(el('label', { text: 'Derived from (source ids, one per line)' }));
  const derivedFromInput = el('textarea', { name: 'derived_from', rows: 2 });
  derivedFromInput.value = source.provenance.derived_from.join('\n');
  provenance.appendChild(derivedFromInput);
  form.appendChild(provenance);

  // --- Quality ---
  const quality = el('fieldset', {}, [el('legend', { text: 'Quality' })]);
  quality.appendChild(el('label', { text: 'Status' }));
  quality.appendChild(select('status', QUALITY_STATUSES, source.quality.status));

  quality.appendChild(el('label', { text: 'Known issues (one per line)' }));
  const knownIssuesInput = el('textarea', { name: 'known_issues', rows: 2 });
  knownIssuesInput.value = source.quality.known_issues.join('\n');
  quality.appendChild(knownIssuesInput);

  quality.appendChild(el('label', { text: 'Last verified (YYYY-MM-DD)' }));
  const lastVerifiedInput = el('input', { type: 'text', name: 'last_verified', value: source.quality.last_verified });
  quality.appendChild(lastVerifiedInput);
  form.appendChild(quality);

  // --- Used in ---
  const usedIn = el('fieldset', {}, [el('legend', { text: 'Used in' })]);
  usedIn.appendChild(el('label', { text: 'Repo / paper slugs (one per line)' }));
  const usedInInput = el('textarea', { name: 'used_in', rows: 2 });
  usedInInput.value = source.used_in.join('\n');
  usedIn.appendChild(usedInInput);
  form.appendChild(usedIn);

  // --- Actions ---
  const actions = el('div', { class: 'form-actions' });
  const saveBtn = el('button', { type: 'submit', class: 'primary', text: isEdit ? 'Save changes' : 'Create source' });
  const cancelBtn = el('button', { type: 'button', text: 'Cancel' });
  cancelBtn.addEventListener('click', renderList);
  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  form.appendChild(actions);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorsBox.style.display = 'none';

    let resourcesValue;
    try {
      resourcesValue = JSON.parse(resourcesInput.value || '[]');
    } catch (err) {
      errorsBox.textContent = `Resources JSON is invalid: ${err.message}`;
      errorsBox.style.display = 'block';
      return;
    }

    const payload = {
      id: isEdit ? source.id : idInput.value.trim(),
      title: titleInput.value.trim(),
      abstract: abstractInput.value.trim(),
      domain: getCheckedValues(form, 'domain'),
      themes: linesToArray(themesInput.value),
      keywords: linesToArray(keywordsInput.value),
      spatial: {
        bbox: bboxInputs.map((i) => Number(i.value)),
        subbasins: getCheckedValues(form, 'subbasins'),
        resolution: resolutionInput.value.trim(),
        geometry_file: geometryInput.value.trim() || null,
      },
      temporal: {
        start: startInput.value.trim(),
        end: endInput.value.trim(),
        frequency: frequencySelect.value,
        ongoing: form.querySelector('input[name="ongoing"]').checked,
      },
      resources: resourcesValue,
      access: {
        tier: form.querySelector('select[name="tier"]').value,
        steward: { name: stewardName.value.trim(), email: stewardEmail.value.trim() },
        how_to_request: howToRequest.value.trim(),
      },
      provenance: {
        originator: originatorInput.value.trim(),
        license: licenseInput.value.trim(),
        citation: citationInput.value.trim(),
        doi: doiInput.value.trim() || null,
        source_url: urlInput.value.trim() || null,
        derived_from: linesToArray(derivedFromInput.value),
      },
      quality: {
        status: form.querySelector('select[name="status"]').value,
        known_issues: linesToArray(knownIssuesInput.value),
        last_verified: lastVerifiedInput.value.trim(),
      },
      used_in: linesToArray(usedInInput.value),
    };

    const result = isEdit ? await apiUpdate(source.id, payload) : await apiCreate(payload);
    if (!result.ok) {
      errorsBox.textContent = (result.data.errors || ['Unknown error']).join('; ');
      errorsBox.style.display = 'block';
      return;
    }
    renderList();
  });

  app.appendChild(form);
}

renderList();
