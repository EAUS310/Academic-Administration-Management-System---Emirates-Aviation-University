// coursework-analysis.js — Coursework Analysis page (GitHub Pages static version)
// Depends on: storage.js, exporter.js (loaded in HTML)

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
  if (d && d.generated) loadReport();
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
    uploadResult.innerHTML = `<div class="result-ok" style="margin-bottom:0;">&#10003; Parsed — <strong>${parsed.records.length}</strong> grade records, <strong>${parsed.modules.length}</strong> modules.</div>`;
    loadReport();
  } catch (err) {
    progressBar.style.background = '#dc3545';
    uploadResult.style.display = 'block';
    uploadResult.innerHTML = `<div class="result-err">&#10007; ${err.message}</div>`;
  } finally {
    uploadBtn.disabled = false;
  }
}

let rawRecords = [];
let cwThreshold = 50, finalThreshold = 50, overallThreshold = 60;

function loadReport() {
  const records = Store.get(KEYS.GRADES_RAW);
  const meta    = Store.get(KEYS.GRADES_META);
  if (!records || !records.length || !meta) return;

  // Enrich raw records with meta lookup
  const metaByName = {};
  for (const m of meta) metaByName[m.module.toLowerCase().trim()] = { code: m.code, program: m.program };

  rawRecords = records.map(r => ({
    ...r,
    meta: metaByName[r.module.toLowerCase().trim()] || {}
  }));

  document.getElementById('emptyState').style.display  = 'none';
  document.getElementById('titleBar').style.display    = 'flex';
  document.getElementById('cwaControls').style.display = 'flex';
  document.getElementById('tableWrap').style.display   = 'block';

  applyFilter();
}

function onCwSlider(val) {
  cwThreshold = Number(val);
  document.getElementById('cwThresholdVal').textContent = val;
  applyFilter();
}

function onFinalSlider(val) {
  finalThreshold = Number(val);
  document.getElementById('finalThresholdVal').textContent = val;
  applyFilter();
}

function applyFilter() {
  const q = (document.getElementById('cwSearch').value || '').toLowerCase().trim();

  const byModule = {};
  for (const r of rawRecords) {
    const key = r.module;
    if (!byModule[key]) byModule[key] = { meta: r.meta, total: 0, cwFail: 0, finalFail: 0, overallFail: 0 };
    const m = byModule[key];
    m.total++;
    if (r.cwGross    != null && r.cwGross    < cwThreshold)    m.cwFail++;
    if (r.finalGross != null && r.finalGross < finalThreshold) m.finalFail++;
    if (r.grade === 'F') m.overallFail++;
  }

  let rows = Object.entries(byModule).map(([moduleName, counts]) => ({
    program:     counts.meta.program || '',
    code:        counts.meta.code    || '',
    module:      moduleName,
    total:       counts.total,
    cwFail:      counts.cwFail,
    finalFail:   counts.finalFail,
    overallFail: counts.overallFail
  })).sort((a, b) => b.cwFail - a.cwFail || b.overallFail - a.overallFail);

  if (q) {
    rows = rows.filter(r =>
      (r.code   || '').toLowerCase().includes(q) ||
      (r.module || '').toLowerCase().includes(q) ||
      (r.program|| '').toLowerCase().includes(q));
  }

  renderTable(rows);
}

function renderTable(rows) {
  const tbody = document.getElementById('cwaBody');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#aaa;">No matching modules.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((r, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f7f8fa'};">
      <td class="cwa-td">${esc(r.program || '—')}</td>
      <td class="cwa-td cwa-td-code">${esc(r.code || '—')}</td>
      <td class="cwa-td">${esc(r.module || '—')}</td>
      <td class="cwa-td cwa-td-num">${r.total}</td>
      <td class="cwa-td cwa-td-num">${r.cwFail || 0}</td>
      <td class="cwa-td cwa-td-num">${r.finalFail || 0}</td>
      <td class="cwa-td cwa-td-num">${r.overallFail || 0}</td>
    </tr>`).join('');
}

function downloadExcel() {
  const records = Store.get(KEYS.GRADES_RAW);
  const meta    = Store.get(KEYS.GRADES_META);
  if (!records || !meta) return;
  exportCourseworkExcel(records, meta, { cwThreshold, finalThreshold, overallThreshold });
}

function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
