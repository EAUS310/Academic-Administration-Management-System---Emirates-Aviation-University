// app.js — Student Search (GitHub Pages static version)
// Depends on: storage.js, parser.js (loaded in HTML)

const modalBg      = document.getElementById('modalBg');
const dropZone     = document.getElementById('dropZone');
const fileInput    = document.getElementById('fileInput');
const uploadBtn    = document.getElementById('uploadBtn');
const progressWrap = document.getElementById('progressWrap');
const progressBar  = document.getElementById('progressBar');
const uploadResult = document.getElementById('uploadResult');
const selectedFile = document.getElementById('selectedFile');
const statusInfo   = document.getElementById('statusInfo');

let chosenFile = null;

// ── Status on load ────────────────────────────────────────────────────────────
(function loadStatus() {
  const el = document.getElementById('dataStatus');
  const d  = Store.get(KEYS.STUDENTS);
  if (d && d.total) {
    el.textContent = `Data loaded: ${d.total.toLocaleString()} students · Last updated: ${new Date(d.generated).toLocaleString()}`;
  } else {
    el.textContent = 'No data loaded yet — click "Upload MES" to get started.';
  }
})();

function openUpload() {
  modalBg.classList.add('open');
  const d = Store.get(KEYS.STUDENTS);
  if (d && d.total) {
    statusInfo.style.display = 'block';
    statusInfo.innerHTML = `Current data: <strong>${d.total.toLocaleString()} students</strong> · Updated ${new Date(d.generated).toLocaleString()}`;
  }
}

function closeUpload(e) {
  if (e && e.target !== modalBg) return;
  modalBg.classList.remove('open');
  resetUpload();
}

function resetUpload() {
  chosenFile = null;
  fileInput.value = '';
  selectedFile.style.display  = 'none';
  selectedFile.textContent    = '';
  uploadBtn.disabled          = true;
  progressWrap.style.display  = 'none';
  progressBar.style.width     = '0';
  uploadResult.style.display  = 'none';
  dropZone.style.display      = 'block';
}

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('over');
  const f = e.dataTransfer.files[0];
  if (f) pickFile(f);
});
fileInput.addEventListener('change', () => { if (fileInput.files[0]) pickFile(fileInput.files[0]); });

function pickFile(f) {
  if (!f.name.endsWith('.xlsx')) { alert('Please select a .xlsx file.'); return; }
  chosenFile = f;
  selectedFile.style.display = 'block';
  selectedFile.innerHTML = `<strong>Selected:</strong> ${f.name} &nbsp; <span style="color:#aaa">${(f.size/1024).toFixed(1)} KB</span>`;
  uploadBtn.disabled = false;
  uploadResult.style.display = 'none';
}

async function doUpload() {
  if (!chosenFile) return;
  uploadBtn.disabled = true;
  progressWrap.style.display = 'block';
  progressBar.style.background = '#1b3a5c';
  progressBar.style.width = '40%';
  uploadResult.style.display = 'none';

  try {
    progressBar.style.width = '70%';
    const buf  = await chosenFile.arrayBuffer();
    const data = parseStudentFile(buf);
    progressBar.style.width = '100%';

    Store.set(KEYS.STUDENTS, data);

    uploadResult.style.display = 'block';
    uploadResult.innerHTML = `
      <div class="result-ok">&#10003; Parsed <strong>${data.total.toLocaleString()} students</strong> successfully.</div>
      <table class="result-table" style="margin-top:10px;">
        <thead><tr><th>Sheet</th><th>Program</th><th>Students</th></tr></thead>
        <tbody>
          ${data.summary.map(s => `
            <tr>
              <td><strong>${s.tab}</strong></td>
              <td>${s.label || '—'}</td>
              <td>${s.count || 0}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;

    document.getElementById('dataStatus').textContent =
      `Data loaded: ${data.total.toLocaleString()} students · Updated just now.`;

  } catch (err) {
    progressBar.style.background = '#dc3545';
    uploadResult.style.display = 'block';
    uploadResult.innerHTML = `<div class="result-err">&#10007; ${err.message}</div>`;
  } finally {
    uploadBtn.disabled = false;
  }
}

// ── Search ────────────────────────────────────────────────────────────────────
const searchInput = document.getElementById('searchInput');
searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') search(); });

function search() {
  const q = searchInput.value.trim();
  if (!q) return;

  showEmpty();

  const d = Store.get(KEYS.STUDENTS);
  if (!d || !d.students) {
    document.getElementById('dataStatus').textContent =
      'No data loaded yet — click "Upload MES" to get started.';
    showEmpty();
    return;
  }

  const matches = d.students.filter(s => s.id.toUpperCase() === q.toUpperCase());
  if (!matches.length) { showNotFound(q); return; }
  showStudent(matches[0]);
}

function showEmpty() {
  document.getElementById('emptyState').style.display = '';
  document.getElementById('results').style.display    = 'none';
  document.getElementById('notFound').style.display   = 'none';
}

function showNotFound(id) {
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('results').style.display    = 'none';
  document.getElementById('notFound').style.display   = '';
  document.getElementById('notFoundId').textContent   = id;
}

function showStudent(s) {
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('notFound').style.display   = 'none';
  document.getElementById('results').style.display    = '';

  function fill(id, val) {
    const el = document.getElementById(id);
    if (val && String(val).trim()) {
      el.textContent = val;
      el.className = '';
    } else {
      el.textContent = '—';
      el.className = 'empty';
    }
  }

  fill('iName',     s.name);
  fill('iProgram',  s.programLabel ? `${s.program}  ·  ${s.programLabel}` : s.program);
  fill('iMode',     s.mode);
  fill('iExpGrad',  s.expectedGrad);
  fill('iNumMods',  s.numModules > 0 ? `${s.numModules} module${s.numModules !== 1 ? 's' : ''}` : '0');
  fill('iFinance',  s.finance);
  fill('iSemester', s.semester);

  document.getElementById('modBadge').textContent = s.modules.length;

  const tbody    = document.getElementById('modBody');
  const noMods   = document.getElementById('noMods');
  const modTable = document.getElementById('modTable');

  if (!s.modules || s.modules.length === 0) {
    modTable.style.display = 'none';
    noMods.style.display   = 'block';
  } else {
    modTable.style.display = '';
    noMods.style.display   = 'none';
    tbody.innerHTML = s.modules.map(m => `
      <tr>
        <td class="col-code">${m.code || '—'}</td>
        <td class="col-name">${m.name || '—'}</td>
        <td class="col-sec"><span class="sec-chip">${m.section}</span></td>
      </tr>`).join('');
  }
}
