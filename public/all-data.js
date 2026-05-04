// all-data.js — All Attendance Data page (GitHub Pages static version)
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

try {
  const d = Store.get(KEYS.ATTENDANCE);
  if (d && d.generated) {
    document.getElementById('infoStatus').textContent =
      `Last updated: ${new Date(d.generated).toLocaleString()}`;
    loadAllData();
  }
} catch (e) {
  console.error('[all-data] loadStatus failed:', e);
}

function openUpload() {
  modalBg.classList.add('open');
  const d = Store.get(KEYS.ATTENDANCE);
  if (d && d.generated) {
    statusInfo.style.display = 'block';
    statusInfo.innerHTML =
      `Current data: <strong>${d.totalModules} modules flagged</strong>, ` +
      `<strong>${d.totalFlagged} students at risk</strong> · Updated ${new Date(d.generated).toLocaleString()}`;
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
  selectedFile.style.display = 'none'; selectedFile.textContent = '';
  uploadBtn.disabled = true;
  progressWrap.style.display = 'none'; progressBar.style.width = '0';
  uploadResult.style.display = 'none';
  dropZone.style.display = 'block';
}

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) pickFile(f); });
fileInput.addEventListener('change', () => { if (fileInput.files[0]) pickFile(fileInput.files[0]); });

function pickFile(f) {
  const lower = f.name.toLowerCase();
  if (!lower.endsWith('.xlsx') && !lower.endsWith('.csv')) { alert('Please select a .xlsx or .csv file.'); return; }
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
  progressBar.style.width = '30%';
  uploadResult.style.display = 'none';
  try {
    progressBar.style.width = '60%';
    const buf    = await chosenFile.arrayBuffer();
    const result = parseAttendanceFile(buf, chosenFile.name);
    progressBar.style.width = '100%';
    const { modMap, allModules, ...summary } = result;
    if (Object.keys(modMap).length) Store.set(KEYS.MODULES, modMap);
    Store.set(KEYS.ATTENDANCE,     summary);
    Store.set(KEYS.ATTENDANCE_ALL, { ...summary, modules: allModules });
    uploadResult.style.display = 'block';
    uploadResult.innerHTML = `<div class="result-ok" style="margin-bottom:0;">&#10003; Parsed successfully &mdash; <strong>${result.totalModules} modules</strong> flagged, <strong>${result.totalFlagged} students</strong> above 10% absence rate.</div>`;
    document.getElementById('infoStatus').textContent = 'Last updated: just now';
    loadAllData();
  } catch (err) {
    progressBar.style.background = '#dc3545';
    uploadResult.style.display = 'block';
    uploadResult.innerHTML = `<div class="result-err">&#10007; ${err.message}</div>`;
  } finally {
    uploadBtn.disabled = false;
  }
}

let allData = null;
let currentModules = [];
let msStudents, msPrograms, msModules, msWarnings;

function loadAllData() {
  const data = Store.get(KEYS.ATTENDANCE_ALL);
  if (!data || data.noData) return;
  if (!Array.isArray(data.modules)) return;

  allData = data;
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('moduleList').style.display = '';
  document.getElementById('filterBar').style.display  = '';

  const totalStudents = new Set(data.modules.flatMap(m => m.students.map(s => s.id))).size;
  document.getElementById('infoText').innerHTML =
    `All Attendance Data &mdash; ` +
    `<strong style="color:#1b3a5c;">${data.modules.length} modules</strong> &nbsp;|&nbsp; ` +
    `<strong style="color:#1b3a5c;">${totalStudents}</strong> students`;

  populateFilters(data.modules);
  renderModules(data.modules);
}

function populateFilters(modules) {
  const studentIds = new Set(), programs = new Set(), modCodes = new Set();
  for (const m of modules) {
    modCodes.add(m.moduleCode);
    for (const s of m.students) { studentIds.add(s.id); programs.add(s.program); }
  }
  msStudents = new MultiSelect('ms-students', 'Select student IDs...');
  msStudents.setOptions([...studentIds].sort());
  msPrograms = new MultiSelect('ms-programs', 'Select programs...');
  msPrograms.setOptions([...programs].sort());
  msModules = new MultiSelect('ms-modules', 'Select module codes...');
  msModules.setOptions([...modCodes].sort());
  msWarnings = new MultiSelect('ms-warnings', 'Select warning level...', ['No warning', '10% issued', '20% issued', '25% issued']);
}

function resetFilters() {
  [msStudents, msPrograms, msModules, msWarnings].forEach(ms => ms && ms.clear());
  applyFilters();
}

function applyFilters() {
  if (!allData) return;
  const selStudents = msStudents ? msStudents.getSelected() : [];
  const selPrograms = msPrograms ? msPrograms.getSelected() : [];
  const selModules  = msModules  ? msModules.getSelected()  : [];
  const selWarnings = msWarnings ? msWarnings.getSelected() : [];

  const filtered = allData.modules
    .filter(m => !selModules.length || selModules.includes(m.moduleCode))
    .map(m => ({
      ...m,
      students: m.students.filter(s => {
        if (selStudents.length && !selStudents.includes(s.id)) return false;
        if (selPrograms.length && !selPrograms.includes(s.program)) return false;
        if (selWarnings.length && !selWarnings.includes(warnIssuedText(s.warnPct))) return false;
        return true;
      })
    }))
    .filter(m => m.students.length > 0);

  renderModules(filtered);
}

function renderModules(modules) {
  currentModules = modules;
  const list = document.getElementById('moduleList');
  list.innerHTML = modules.map(m => `
    <div class="att-module">
      <div class="att-module-hdr">
        <span class="att-mod-code">${esc(m.moduleCode)}</span>
        <span class="att-mod-name">${esc(m.moduleName)}</span>
      </div>
      <table class="att-table">
        <thead><tr>
          <th>Student ID</th><th>Full Name</th><th>Absences</th>
          <th>Lates</th><th>Missed Hrs</th><th>Warning %</th><th>Warning Issued</th>
        </tr></thead>
        <tbody>
          ${m.students.map(s => `
          <tr>
            <td class="att-id">${esc(s.id)}</td>
            <td>${esc(s.name)}</td>
            <td style="text-align:center;">${s.absences}</td>
            <td style="text-align:center;">${s.ame ? '<span style="color:#bbb;">—</span>' : s.lates}</td>
            <td style="text-align:center;">${s.ame ? s.missedHrs + ' hrs' : '<span style="color:#bbb;">—</span>'}</td>
            <td style="text-align:center;">${warnBadge(s.warnPct)}</td>
            <td style="text-align:center;">${warnIssuedBadge(s.warnPct)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`).join('');
}

function warnBadge(pct) {
  if (pct <= 10) return `<span style="font-size:12px;color:#999;">${pct}%</span>`;
  return `<span class="warn-pct ${pct >= 25 ? 'warn-red' : 'warn-amber'}">${pct}%</span>`;
}

function warnIssuedText(pct) {
  if (pct >= 25) return '25% issued';
  if (pct >= 20) return '20% issued';
  if (pct > 10)  return '10% issued';
  return 'No warning';
}

function warnIssuedBadge(pct) {
  const text = warnIssuedText(pct);
  if (pct <= 10) return `<span class="warn-issued warn-issued-none">${text}</span>`;
  const cls = pct >= 25 ? 'warn-issued-25' : pct >= 20 ? 'warn-issued-20' : 'warn-issued-10';
  return `<span class="warn-issued ${cls}">${text}</span>`;
}

function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
