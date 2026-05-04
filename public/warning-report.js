// warning-report.js — Academic Warning Report (GitHub Pages static version)
// Depends on: storage.js, parser.js, exporter.js (loaded in HTML)

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
    document.getElementById('wrStatus').textContent =
      `Last updated: ${new Date(d.generated).toLocaleString()}`;
    loadReport();
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
    uploadResult.innerHTML = `<div class="result-ok" style="margin-bottom:0;">&#10003; Parsed — <strong>${parsed.records.length}</strong> grade records, <strong>${parsed.modules.length}</strong> modules.</div>`;
    document.getElementById('wrStatus').textContent = 'Last updated: just now';
    loadReport();
  } catch (err) {
    progressBar.style.background = '#dc3545';
    uploadResult.style.display = 'block';
    uploadResult.innerHTML = `<div class="result-err">&#10007; ${err.message}</div>`;
  } finally {
    uploadBtn.disabled = false;
  }
}

function loadReport() {
  const warnList  = Store.get(KEYS.WARNING_DATA);
  const gradeRecs = Store.get(KEYS.GRADES_RAW);
  const metaList  = Store.get(KEYS.GRADES_META);
  if (!warnList || !warnList.length || !gradeRecs || !metaList) return;

  const gradeByStudent = {};
  for (const r of gradeRecs) {
    if (!r.studentId) continue;
    if (!gradeByStudent[r.studentId]) gradeByStudent[r.studentId] = [];
    gradeByStudent[r.studentId].push({ module: r.module, grade: r.grade, finalMark: r.finalMark });
  }

  const metaByName = {};
  for (const m of metaList) metaByName[m.module.toLowerCase().trim()] = { code: m.code, instructor: m.instructor };

  const students = warnList.map(w => {
    const moduleGrades = (gradeByStudent[w.studentId] || []).map(g => {
      const meta = metaByName[g.module.toLowerCase().trim()] || {};
      return { moduleCode: meta.code || '', moduleName: g.module, instructor: meta.instructor || 'NA', finalMark: g.finalMark, grade: g.grade };
    });
    return { ...w, modules: moduleGrades };
  });

  if (!students.length) return;

  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('tableWrap').style.display  = 'block';
  document.getElementById('dlBtn').style.display      = 'flex';
  renderReport(students);
}

function renderReport(students) {
  const tbody   = document.getElementById('wrBody');
  const maxMods = Math.max(...students.map(s => s.modules.length), 1);
  const rows    = [];

  const modColHeaders = Array.from({ length: maxMods }, (_, i) =>
    `<th class="wr-th-mod">Module ${i + 1}</th>`).join('');

  rows.push(`
    <tr class="wr-header-row">
      <th class="wr-th-blue">S.No</th>
      <th class="wr-th-blue">ID</th>
      <th class="wr-th-blue wr-th-name">Full Name</th>
      <th class="wr-th-blue">Cr. Hr.</th>
      <th class="wr-th-blue">CGPA</th>
      <th class="wr-th-blue">AW Status</th>
      <th class="wr-th-blue wr-th-dec">Council Decision</th>
      <th class="wr-th-label"></th>
      <th class="wr-th-red" colspan="${maxMods}">Final Grades</th>
    </tr>`);

  students.forEach((s, si) => {
    const mods = s.modules;
    const bg   = si % 2 === 0 ? '#fff' : '#f7f8fa';
    const span = `rowspan="4" style="background:${bg};"`;

    rows.push(`
      <tr style="background:${bg};">
        <td class="wr-left wr-center" ${span}>${esc(s.sno)}</td>
        <td class="wr-left wr-id"     ${span}>${esc(s.studentId)}</td>
        <td class="wr-left wr-name"   ${span}>${esc(s.name)}</td>
        <td class="wr-left wr-center" ${span}>${s.creditHours != null ? s.creditHours : '—'}</td>
        <td class="wr-left wr-cgpa"   ${span}>${s.cgpa != null ? s.cgpa : '—'}</td>
        <td class="wr-left wr-center" ${span}>${esc(s.awStatus)}</td>
        <td class="wr-left wr-dec"    ${span}>${esc(s.councilDecision)}</td>
        <td class="wr-row-label">Instructor</td>
        ${mods.map(m => `<td class="wr-mod-hdr">${esc(m.instructor||'NA')}</td>`).join('')}
      </tr>
      <tr style="background:${bg};">
        <td class="wr-row-label">Module</td>
        ${mods.map(m => `<td class="wr-cell wr-center wr-modname">${esc(m.moduleName)}</td>`).join('')}
      </tr>
      <tr style="background:${bg};">
        <td class="wr-row-label">Final Marks</td>
        ${mods.map(m => `<td class="wr-cell wr-center">${m.finalMark != null ? m.finalMark : '—'}</td>`).join('')}
      </tr>
      <tr style="background:${bg};border-bottom:2px solid #c8cfd8;">
        <td class="wr-row-label">Final Grades</td>
        ${mods.map(m => `<td class="wr-cell wr-center"><span class="wr-grade ${gradeClass(m.grade)}">${esc(m.grade)}</span></td>`).join('')}
      </tr>`);
  });

  tbody.innerHTML = rows.join('');
}

function gradeClass(g) {
  if (!g) return '';
  if (g === 'A' || g === 'B+' || g === 'B') return 'wr-grade-pass';
  if (g === 'C+' || g === 'C') return 'wr-grade-avg';
  if (g === 'D+' || g === 'D') return 'wr-grade-low';
  if (g === 'F') return 'wr-grade-fail';
  return '';
}

function downloadExcel() {
  const warnList  = Store.get(KEYS.WARNING_DATA);
  const gradeRecs = Store.get(KEYS.GRADES_RAW);
  const metaList  = Store.get(KEYS.GRADES_META);
  if (!warnList || !gradeRecs || !metaList) return;
  exportWarningExcel(warnList, gradeRecs, metaList);
}

function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
