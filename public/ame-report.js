// ame-report.js — AME Attendance Report (GitHub Pages static version)
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
    document.getElementById('ameStatus').textContent =
      `Last updated: ${new Date(d.generated).toLocaleString()}`;
    loadAMEData();
  }
} catch (e) {
  console.error('[ame-report] loadStatus failed:', e);
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
    document.getElementById('ameStatus').textContent = 'Last updated: just now';
    loadAMEData();
  } catch (err) {
    progressBar.style.background = '#dc3545';
    uploadResult.style.display = 'block';
    uploadResult.innerHTML = `<div class="result-err">&#10007; ${err.message}</div>`;
  } finally {
    uploadBtn.disabled = false;
  }
}

let tableData = [];
let msAMEStudents;

function loadAMEData() {
  const data = Store.get(KEYS.ATTENDANCE);
  if (!data || data.noData) return;
  if (!Array.isArray(data.modules)) return;

  tableData = [];
  for (const m of data.modules) {
    if (!m || !Array.isArray(m.students)) continue;
    const code = String(m.moduleCode || '').toUpperCase();
    for (const s of m.students) {
      const prog = String(s.program || '').toLowerCase();
      if (prog.includes('aircraft maintenance engineering') && !code.startsWith('GEN')) {
        tableData.push({
          studentId:   s.id,
          studentName: s.name,
          moduleCode:  m.moduleCode,
          moduleName:  m.moduleName,
          warnPct:     s.warnPct
        });
      }
    }
  }

  tableData.sort((a, b) => b.warnPct - a.warnPct);

  if (!tableData.length) {
    document.getElementById('emptyState').querySelector('p').textContent =
      'No AME students with attendance warnings found.';
    return;
  }

  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('ameTableWrap').style.display = 'block';
  document.getElementById('excelBtn').style.display    = 'flex';
  document.getElementById('filterBar').style.display   = '';

  const studentIds = [...new Set(tableData.map(r => r.studentId))].sort();
  msAMEStudents = new MultiSelect('ms-ame-students', 'Select student IDs...');
  msAMEStudents.setOptions(studentIds);

  renderAMETable(tableData);
}

function resetAMEFilter() {
  msAMEStudents && msAMEStudents.clear();
  renderAMETable(tableData);
}

function renderAMETable(rows) {
  document.getElementById('ameCount').textContent = `${rows.length} record${rows.length !== 1 ? 's' : ''}`;
  document.getElementById('ameBody').innerHTML = rows.map(r => `
    <tr>
      <td class="att-id">${esc(r.studentId)}</td>
      <td>${esc(r.studentName)}</td>
      <td>${esc(r.moduleCode)}</td>
      <td>${esc(r.moduleName)}</td>
      <td style="text-align:center;">${warnBadge(r.warnPct)}</td>
    </tr>`).join('');
}

function applyFilters() {
  if (!tableData.length) return;
  const sel = msAMEStudents ? msAMEStudents.getSelected() : [];
  renderAMETable(sel.length ? tableData.filter(r => sel.includes(r.studentId)) : tableData);
}

function downloadExcel() {
  if (!tableData.length) return;
  const wsData = [
    ['Student ID', 'Student Name', 'Module Code', 'Module Name', 'Warning %'],
    ...tableData.map(r => [r.studentId, r.studentName, r.moduleCode, r.moduleName, r.warnPct])
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = wsData[0].map((_, ci) => ({ wch: Math.max(...wsData.map(row => String(row[ci]??'').length)) + 2 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'AME Warnings');
  const buf  = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'AME_Attendance_Warning.xlsx'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function warnBadge(pct) {
  return `<span class="warn-pct ${pct >= 25 ? 'warn-red' : 'warn-amber'}">${pct}%</span>`;
}

function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
