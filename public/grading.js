// grading.js — Grade Distribution page (GitHub Pages static version)
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

// ── Status on load ────────────────────────────────────────────────────────────
(function loadStatus() {
  const d = Store.get(KEYS.GRADES);
  if (d && d.generated) {
    document.getElementById('gradeStatus').textContent =
      `Last updated: ${new Date(d.generated).toLocaleString()}`;
    loadGrades();
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
  selectedFile.style.display  = 'none';
  uploadBtn.disabled          = true;
  progressWrap.style.display  = 'none';
  progressBar.style.width     = '0';
  uploadResult.style.display  = 'none';
  dropZone.style.display      = 'block';
}

dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('over');
  if (e.dataTransfer.files[0]) pickFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => { if (fileInput.files[0]) pickFile(fileInput.files[0]); });

function pickFile(f) {
  if (!f.name.endsWith('.xlsx')) { alert('Please select an .xlsx file.'); return; }
  chosenFile = f;
  selectedFile.style.display = 'block';
  selectedFile.innerHTML =
    `<strong>Selected:</strong> ${f.name} &nbsp;<span style="color:#aaa">${(f.size/1024).toFixed(1)} KB</span>`;
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
    progressBar.style.width = '90%';

    const analysis = computeGradeAnalysis(parsed.records, parsed.modules);

    Store.set(KEYS.GRADES_RAW,  parsed.records);
    Store.set(KEYS.GRADES_META, parsed.modules);
    Store.set(KEYS.GRADES,      analysis);
    Store.set(KEYS.GRADES_SHEET, parsed.sheetData);
    if (parsed.warningData && parsed.warningData.length)
      Store.set(KEYS.WARNING_DATA, parsed.warningData);

    progressBar.style.width = '100%';

    uploadResult.style.display = 'block';
    uploadResult.innerHTML = `
      <div class="result-ok" style="margin-bottom:0;">
        &#10003; Parsed &mdash;
        <strong>${parsed.records.length} grade records</strong> and
        <strong>${parsed.modules.length} modules</strong> loaded.
        Analysis: <strong>${analysis.totalModules} modules</strong>, <strong>${analysis.totalStudents} students</strong>.
      </div>`;

    document.getElementById('gradeStatus').textContent = 'Last updated: just now';
    loadGrades();

  } catch (err) {
    progressBar.style.background = '#dc3545';
    uploadResult.style.display = 'block';
    uploadResult.innerHTML = `<div class="result-err">&#10007; ${err.message}</div>`;
  } finally {
    uploadBtn.disabled = false;
  }
}

// ── Grading data ───────────────────────────────────────────────────────────────
let allModules = [];
let msGradeCodes, msGradePrograms;

function loadGrades() {
  const data = Store.get(KEYS.GRADES);
  if (!data || !data.modules) return;

  allModules = data.modules;
  if (!allModules.length) return;

  document.getElementById('emptyState').style.display    = 'none';
  document.getElementById('tableWrap').style.display     = 'block';
  document.getElementById('downloadBtns').style.display  = 'flex';
  document.getElementById('filterBar').style.display     = '';

  const programs = [...new Set(allModules.map(m => m.program).filter(Boolean))].sort();
  const codes    = [...new Set(allModules.map(m => m.code).filter(c => c !== '—'))].sort();

  document.getElementById('ms-grade-programs').innerHTML = '';
  document.getElementById('ms-grade-codes').innerHTML    = '';

  msGradePrograms = new MultiSelect('ms-grade-programs', 'Select programs...');
  msGradePrograms.setOptions(programs);
  msGradeCodes = new MultiSelect('ms-grade-codes', 'Select module codes...');
  msGradeCodes.setOptions(codes);

  renderTable(allModules);
}

function resetFilter() {
  msGradePrograms && msGradePrograms.clear();
  msGradeCodes    && msGradeCodes.clear();
  renderTable(allModules);
}

function applyFilters() {
  if (!allModules.length) return;
  const selPrograms = msGradePrograms ? msGradePrograms.getSelected() : [];
  const selCodes    = msGradeCodes    ? msGradeCodes.getSelected()    : [];
  const filtered = allModules.filter(m =>
    (!selPrograms.length || selPrograms.includes(m.program)) &&
    (!selCodes.length    || selCodes.includes(m.code))
  );
  renderTable(filtered);
}

const GRADE_ORDER = ['A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'F', 'W/I'];

function renderTable(modules) {
  const sorted = [...modules].sort((a, b) => {
    const prog = (a.program || '').localeCompare(b.program || '');
    if (prog !== 0) return prog;
    return b.failNFPct - a.failNFPct;
  });

  document.getElementById('gradeCount').textContent =
    `${sorted.length} module${sorted.length !== 1 ? 's' : ''}`;

  const tbody = document.getElementById('gradeBody');
  tbody.innerHTML = sorted.map((m, idx) => {
    const g     = m.grades;
    const total = m.total;
    const evenCls = idx % 2 === 0 ? '' : ' gt-group-alt';

    const countCells = GRADE_ORDER.map(gr => `<td class="gt-num">${g[gr] || 0}</td>`).join('');
    const pctCells   = GRADE_ORDER.map(gr => {
      const val = total > 0 ? Math.round(((g[gr] || 0) / total) * 100) : 0;
      return `<td class="gt-num gt-pct-cell">${val}%</td>`;
    }).join('');
    const failCls = m.failNFPct >= 20 ? 'gt-pct-bad' : 'gt-pct-neutral';

    return `
      <tr class="gt-count-row${evenCls}">
        <td class="gt-sno" rowspan="2">${idx + 1}</td>
        <td class="gt-code-cell" rowspan="2">${esc(m.code)}</td>
        <td class="gt-prog-cell" rowspan="2">${esc(m.program)}</td>
        <td class="gt-name-cell" rowspan="2">${esc(m.name)}</td>
        <td class="gt-inst-cell" rowspan="2">${esc(m.instructor)}</td>
        <td class="gt-num gt-total">${total}</td>
        ${countCells}
        <td class="gt-num" rowspan="2">${m.aboveThreshold ?? 0}</td>
        <td class="gt-num" rowspan="2">${m.disciplinary ?? 0}</td>
        <td class="gt-num gt-fail-pct" rowspan="2"><span class="gt-pct ${failCls}">${m.failNFPct}%</span></td>
      </tr>
      <tr class="gt-pct-row${evenCls}">
        <td class="gt-pct-label">%</td>
        ${pctCells}
      </tr>`;
  }).join('');
}

// ── PDF download ───────────────────────────────────────────────────────────────
function downloadPDF() {
  if (!allModules.length) return;
  const selPrograms = msGradePrograms ? msGradePrograms.getSelected() : [];
  const selCodes    = msGradeCodes    ? msGradeCodes.getSelected()    : [];
  const modules = allModules.filter(m =>
    (!selPrograms.length || selPrograms.includes(m.program)) &&
    (!selCodes.length    || selCodes.includes(m.code))
  );

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFontSize(13);
  doc.setTextColor(139, 0, 16);
  doc.text('Grade Distribution by Module', 14, 14);
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(`Generated: ${new Date().toLocaleString()}  ·  ${modules.length} modules`, 14, 20);

  const head = [['#', 'Code', 'Program', 'Module Name', 'Instructor',
                  'Total', 'A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'F', 'W/I',
                  '20% Above', 'Disciplinary', '(F)+(D)+(D+)%']];
  const body = [];
  modules.forEach((m, idx) => {
    const g = m.grades;
    const total = m.total;
    const pct = gr => total > 0 ? Math.round(((g[gr]||0)/total)*100) + '%' : '0%';
    body.push([idx+1, m.code, m.program, m.name, m.instructor, total,
               g['A']||0, g['B+']||0, g['B']||0, g['C+']||0, g['C']||0,
               g['D+']||0, g['D']||0, g['F']||0, g['W/I']||0,
               m.aboveThreshold ?? '—', m.disciplinary ?? '—', `${m.failNFPct}%`]);
    body.push(['', '', '', '', '%', '',
               pct('A'), pct('B+'), pct('B'), pct('C+'), pct('C'),
               pct('D+'), pct('D'), pct('F'), pct('W/I'), '', '', '']);
  });

  doc.autoTable({
    startY: 24, head, body, theme: 'grid',
    styles: { fontSize: 6.5, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [139, 0, 16], textColor: 255, fontStyle: 'bold', fontSize: 6.5 },
    columnStyles: {
      0: { halign:'center', cellWidth:7  }, 1: { cellWidth:16 }, 2: { cellWidth:22 },
      3: { cellWidth:52 },                  4: { cellWidth:22 }, 5: { halign:'center', cellWidth:10 },
      6: { halign:'center', cellWidth:8  }, 7: { halign:'center', cellWidth:8 },
      8: { halign:'center', cellWidth:8  }, 9: { halign:'center', cellWidth:8 },
      10:{ halign:'center', cellWidth:8  },11:{ halign:'center', cellWidth:8 },
      12:{ halign:'center', cellWidth:8  },13:{ halign:'center', cellWidth:8 },
      14:{ halign:'center', cellWidth:9  },15:{ halign:'center', cellWidth:16 }
    },
    didParseCell(data) {
      if (data.section !== 'body') return;
      if (data.column.index === 15) {
        const v = parseFloat(data.cell.raw);
        if (!isNaN(v)) {
          data.cell.styles.textColor = v >= 30 ? [185,28,28] : v >= 15 ? [120,80,0] : [21,128,61];
          data.cell.styles.fontStyle = 'bold';
        }
      }
      if ([11,12,13].includes(data.column.index))
        data.cell.styles.fillColor = [255, 243, 240];
    },
    alternateRowStyles: { fillColor: [250,250,250] }
  });

  doc.save('Grade_Distribution.pdf');
}

// ── Excel download ─────────────────────────────────────────────────────────────
function downloadExcel() {
  const data = Store.get(KEYS.GRADES);
  if (!data) return;
  exportGradesExcel(data);
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
