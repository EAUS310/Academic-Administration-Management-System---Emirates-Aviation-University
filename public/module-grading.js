// module-grading.js — Detailed Module Grading sheet (GitHub Pages static version)
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

(function loadStatus() {
  const d = Store.get(KEYS.GRADES);
  if (d && d.generated) {
    document.getElementById('mgStatus').textContent =
      `Last updated: ${new Date(d.generated).toLocaleString()}`;
    loadSheet();
  }
})();

function openUpload() {
  modalBg.classList.add('open');
  const d = Store.get(KEYS.GRADES);
  if (d && d.generated) {
    statusInfo.style.display = 'block';
    statusInfo.innerHTML =
      `Current data: <strong>${d.totalModules} modules</strong>, ` +
      `<strong>${d.totalStudents} students</strong> · Updated ${new Date(d.generated).toLocaleString()}`;
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
  selectedFile.style.display = 'none';
  uploadBtn.disabled = true;
  progressWrap.style.display = 'none'; progressBar.style.width = '0';
  uploadResult.style.display = 'none';
  dropZone.style.display = 'block';
}

dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('over'); if (e.dataTransfer.files[0]) pickFile(e.dataTransfer.files[0]); });
fileInput.addEventListener('change', () => { if (fileInput.files[0]) pickFile(fileInput.files[0]); });

function pickFile(f) {
  if (!f.name.endsWith('.xlsx')) { alert('Please select an .xlsx file.'); return; }
  chosenFile = f;
  selectedFile.style.display = 'block';
  selectedFile.innerHTML = `<strong>Selected:</strong> ${f.name} &nbsp;<span style="color:#aaa">${(f.size/1024).toFixed(1)} KB</span>`;
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
    const buf    = await chosenFile.arrayBuffer();
    const parsed = parseGradingFile(buf);
    const analysis = computeGradeAnalysis(parsed.records, parsed.modules);
    Store.set(KEYS.GRADES_RAW,  parsed.records);
    Store.set(KEYS.GRADES_META, parsed.modules);
    Store.set(KEYS.GRADES,      analysis);
    Store.set(KEYS.GRADES_SHEET, parsed.sheetData);
    if (parsed.warningData && parsed.warningData.length) Store.set(KEYS.WARNING_DATA, parsed.warningData);
    progressBar.style.width = '100%';
    uploadResult.style.display = 'block';
    uploadResult.innerHTML = `<div class="result-ok" style="margin-bottom:0;">&#10003; Parsed &mdash; <strong>${parsed.records.length} grade records</strong> and <strong>${parsed.modules.length} modules</strong> loaded.</div>`;
    document.getElementById('mgStatus').textContent = 'Last updated: just now';
    loadSheet();
  } catch (err) {
    progressBar.style.background = '#dc3545';
    uploadResult.style.display = 'block';
    uploadResult.innerHTML = `<div class="result-err">&#10007; ${err.message}</div>`;
  } finally {
    uploadBtn.disabled = false;
  }
}

let allRows     = [];
let headers     = [];
let visibleCols = [];

function loadSheet() {
  const data = Store.get(KEYS.GRADES_SHEET);
  if (!data || !data.rows) return;

  headers  = data.headers;
  allRows  = data.rows;

  visibleCols = headers
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h.trim() !== '')
    .map(({ i }) => i);

  buildHeader();
  populateModuleFilter();

  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('tableWrap').style.display  = 'block';
  document.getElementById('filterBar').style.display  = '';

  applyFilter();
}

function buildHeader() {
  const tr = document.createElement('tr');
  tr.innerHTML = '<th style="width:40px;text-align:center;">#</th>' +
    visibleCols.map(i => `<th>${esc(headers[i])}</th>`).join('');
  document.getElementById('mgHead').innerHTML = '';
  document.getElementById('mgHead').appendChild(tr);
}

function populateModuleFilter() {
  const modColIdx = visibleCols.find(i => headers[i].toUpperCase() === 'MODULE');
  if (modColIdx === undefined) return;

  const modules = [...new Set(allRows.map(r => r[modColIdx]))].filter(Boolean).sort();
  const sel = document.getElementById('moduleFilter');
  sel.innerHTML = '<option value="">All Modules</option>';
  modules.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m;
    sel.appendChild(opt);
  });
}

function applyFilter() {
  const modVal    = document.getElementById('moduleFilter').value.toLowerCase();
  const searchVal = document.getElementById('searchInput').value.toLowerCase().trim();
  const modColIdx = visibleCols.find(i => headers[i].toUpperCase() === 'MODULE');

  const filtered = allRows.filter(row => {
    if (modVal && modColIdx !== undefined) {
      if ((row[modColIdx] || '').toLowerCase() !== modVal) return false;
    }
    if (searchVal) {
      const rowText = visibleCols.map(i => String(row[i] || '')).join(' ').toLowerCase();
      if (!rowText.includes(searchVal)) return false;
    }
    return true;
  });

  renderRows(filtered);
  document.getElementById('rowCount').textContent =
    `${filtered.length} student${filtered.length !== 1 ? 's' : ''}`;
}

function renderRows(rows) {
  const tbody = document.getElementById('mgBody');
  tbody.innerHTML = rows.map((row, idx) => {
    const cells = visibleCols.map(i => {
      const val    = row[i] || '';
      const hUpper = headers[i].toUpperCase();
      if (hUpper.includes('20%') || (hUpper.includes('ATTENDANCE') && hUpper !== 'ATTENDANCE')) {
        if (val === '20%') return `<td style="text-align:center;color:#b45309;font-weight:600;">${val}</td>`;
        return `<td style="text-align:center;">${val}</td>`;
      }
      if (hUpper.includes('DISCIPLIN')) {
        if (val.toUpperCase() === 'Y') return `<td style="text-align:center;color:#7c3aed;font-weight:600;">${val}</td>`;
        return `<td style="text-align:center;">${val}</td>`;
      }
      if (hUpper === 'GRADE') return `<td style="text-align:center;font-weight:600;">${esc(val)}</td>`;
      return `<td>${esc(val)}</td>`;
    }).join('');
    return `<tr><td style="text-align:center;color:#999;">${idx + 1}</td>${cells}</tr>`;
  }).join('');
}

function resetFilter() {
  document.getElementById('moduleFilter').value = '';
  document.getElementById('searchInput').value  = '';
  applyFilter();
}

function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
