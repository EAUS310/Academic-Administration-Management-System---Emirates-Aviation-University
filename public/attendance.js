// attendance.js — Attendance Warning page (GitHub Pages static version)
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
try {
  const d = Store.get(KEYS.ATTENDANCE);
  if (d && d.generated) {
    document.getElementById('infoStatus').textContent =
      `Last updated: ${new Date(d.generated).toLocaleString()}`;
    loadWarnings();
  }
} catch (e) {
  console.error('[attendance] loadStatus failed:', e);
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
  const lower = f.name.toLowerCase();
  if (!lower.endsWith('.xlsx') && !lower.endsWith('.csv')) {
    alert('Please select a .xlsx or .csv file.'); return;
  }
  chosenFile = f;
  selectedFile.style.display = 'block';
  selectedFile.innerHTML =
    `<strong>Selected:</strong> ${f.name} &nbsp; <span style="color:#aaa">${(f.size/1024).toFixed(1)} KB</span>`;
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

    // Persist module map separately (used as cache fallback for future uploads)
    if (Object.keys(modMap).length) Store.set(KEYS.MODULES, modMap);

    // Save summary (warnings only) and full data
    Store.set(KEYS.ATTENDANCE,     summary);
    Store.set(KEYS.ATTENDANCE_ALL, { ...summary, modules: allModules });

    uploadResult.style.display = 'block';
    uploadResult.innerHTML = `
      <div class="result-ok" style="margin-bottom:0;">
        &#10003; Parsed successfully &mdash;
        <strong>${result.totalModules} modules</strong> flagged,
        <strong>${result.totalFlagged} students</strong> above 10% absence rate.
      </div>`;

    document.getElementById('infoStatus').textContent = 'Last updated: just now';
    loadWarnings();

  } catch (err) {
    progressBar.style.background = '#dc3545';
    uploadResult.style.display = 'block';
    uploadResult.innerHTML = `<div class="result-err">&#10007; ${err.message}</div>`;
  } finally {
    uploadBtn.disabled = false;
  }
}

// ── Load and render warnings ───────────────────────────────────────────────────
let allData        = null;
let currentModules = [];
let msStudents, msPrograms, msModules, msWarnings;

function loadWarnings() {
  const data = Store.get(KEYS.ATTENDANCE);
  if (!data || data.noData) return;
  if (!Array.isArray(data.modules)) data.modules = [];

  allData = data;

  document.getElementById('emptyState').style.display  = 'none';
  document.getElementById('moduleList').style.display  = '';
  document.getElementById('filterBar').style.display   = '';

  document.getElementById('infoText').innerHTML =
    `Attendance Warning Report &mdash; ` +
    `<strong style="color:#C8102E;">${data.totalModules} modules</strong> with flagged students &nbsp;|&nbsp; ` +
    `<strong style="color:#C8102E;">${data.totalFlagged}</strong> students above 10% absence rate`;

  populateFilters(data.modules);
  renderModules(data.modules);
}

function populateFilters(modules) {
  const studentIds = new Set();
  const programs   = new Set();
  const modCodes   = new Set();

  for (const m of modules) {
    modCodes.add(m.moduleCode);
    for (const s of m.students) {
      studentIds.add(s.id);
      programs.add(s.program);
    }
  }

  msStudents = new MultiSelect('ms-students', 'Select student IDs...');
  msStudents.setOptions([...studentIds].sort());

  msPrograms = new MultiSelect('ms-programs', 'Select programs...');
  msPrograms.setOptions([...programs].sort());

  msModules = new MultiSelect('ms-modules', 'Select module codes...');
  msModules.setOptions([...modCodes].sort());

  msWarnings = new MultiSelect('ms-warnings', 'Select warning level...', ['10%', '20%', '25%']);
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
        if (selStudents.length && !selStudents.includes(s.id))             return false;
        if (selPrograms.length && !selPrograms.includes(s.program))        return false;
        if (selWarnings.length && !selWarnings.includes(warnIssuedText(s.warnPct))) return false;
        return true;
      })
    }))
    .filter(m => m.students.length > 0);

  renderModules(filtered);
}

function renderModules(modules) {
  currentModules = modules;
  document.getElementById('pdfBtn').style.display = modules.length ? 'flex' : 'none';
  const list = document.getElementById('moduleList');
  list.innerHTML = modules.map(m => `
    <div class="att-module">
      <div class="att-module-hdr">
        <span class="att-mod-code">${esc(m.moduleCode)}</span>
        <span class="att-mod-name">${esc(m.moduleName)}</span>
      </div>
      <table class="att-table">
        <thead>
          <tr>
            <th>Student ID</th>
            <th>Full Name</th>
            <th>Absences</th>
            <th>Lates</th>
            <th>Missed Hrs</th>
            <th>Warning %</th>
            <th style="text-align:center;">Warning</th>
          </tr>
        </thead>
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
    </div>
  `).join('');
}

function warnBadge(pct) {
  const cls = pct >= 25 ? 'warn-red' : 'warn-amber';
  return `<span class="warn-pct ${cls}">${pct}%</span>`;
}

function warnIssuedText(pct) {
  if (pct >= 25) return '25%';
  if (pct >= 20) return '20%';
  return '10%';
}

function warnIssuedBadge(pct) {
  const text = warnIssuedText(pct);
  const cls  = pct >= 25 ? 'warn-issued-25' : pct >= 20 ? 'warn-issued-20' : 'warn-issued-10';
  return `<span class="warn-issued ${cls}">${text}</span>`;
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── PDF generation ─────────────────────────────────────────────────────────────
async function loadLogo(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve({ url: canvas.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function generatePDF() {
  if (!currentModules.length) return;

  const { jsPDF } = window.jspdf;
  const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW  = doc.internal.pageSize.getWidth();
  const pageH  = doc.internal.pageSize.getHeight();
  const margin = 14;

  const logo       = null;
  const logoH      = 13;
  const logoW      = logo ? (logo.w / logo.h) * logoH : 0;
  const weekNumber = allData && allData.weekNumber ? allData.weekNumber : null;
  const weekText   = weekNumber ? `Week ${weekNumber}` : '';
  const reportDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const subLine    = weekText ? `${weekText}   ·   Generated: ${reportDate}` : `Generated: ${reportDate}`;

  function drawPageHeader(isFirstPage) {
    let textX = margin;
    if (isFirstPage && logo) {
      doc.addImage(logo.url, 'PNG', margin, 7, logoW, logoH, '', 'FAST');
      doc.setDrawColor(200, 16, 46);
      doc.setLineWidth(0.5);
      const divX = margin + logoW + 4;
      doc.line(divX, 6, divX, 23);
      textX = divX + 4;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(27, 58, 92);
    doc.text('FOE Attendance Warning List', textX, 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 100, 100);
    doc.text(subLine, textX, 21);
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.line(margin, 24.5, pageW - margin, 24.5);
  }

  function drawPageFooter(pageNum, totalPages) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 160);
    doc.text(`Page ${pageNum} of ${totalPages}`, margin, pageH - 7);
  }

  const headerDrawn = new Set();
  function ensureHeader(pageNum) {
    if (!headerDrawn.has(pageNum)) { drawPageHeader(pageNum === 1); headerDrawn.add(pageNum); }
  }

  let startY = 27;
  ensureHeader(1);

  for (const m of currentModules) {
    if (startY > pageH - 38) {
      doc.addPage();
      const p = doc.internal.getCurrentPageInfo().pageNumber;
      ensureHeader(p);
      startY = 27;
    }
    doc.setFillColor(27, 58, 92);
    doc.rect(margin, startY, pageW - margin * 2, 6.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text(`${m.moduleCode}  —  ${m.moduleName}`, margin + 2.5, startY + 4.4);
    startY += 6.5;

    doc.autoTable({
      startY,
      margin: { left: margin, right: margin },
      head: [['Student ID', 'Full Name', 'Warning']],
      body: m.students.map(s => [s.id, s.name, warnIssuedText(s.warnPct)]),
      styles:             { fontSize: 8, cellPadding: 2.2, textColor: [50, 50, 50] },
      headStyles:         { fillColor: [200, 16, 46], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [247, 247, 247] },
      columnStyles: { 0: { cellWidth: 28 }, 2: { cellWidth: 26, halign: 'center' } },
      showHead: 'everyPage',
      didDrawPage: data => { ensureHeader(data.pageNumber); }
    });

    startY = doc.lastAutoTable.finalY + 5;
  }

  const total = doc.internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    drawPageFooter(p, total);
  }

  const safeName = weekText.replace(/[^a-zA-Z0-9]/g, '_') || 'report';
  doc.save(`FOE_Attendance_Warning_${safeName}.pdf`);
}
