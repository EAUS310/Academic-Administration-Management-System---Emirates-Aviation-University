// ame-module-tracker.js — AME Module Tracker (GitHub Pages static version)
// Depends on: storage.js, parser.js (loaded in HTML)

const SEMESTERS = [
  { label: 'Semester 1', num: 1, color: '#1b3a5c', codes: ['MOD1', 'MOD2', 'MOD3', 'MOD8'] },
  { label: 'Semester 2', num: 2, color: '#2a7f62', codes: ['MOD7M', 'MOD9M_GCAA', 'MOD4'] },
  { label: 'Semester 3', num: 3, color: '#b45309', codes: ['MOD7AW', 'MOD6', 'MOD10M_GCAA', 'MOD5'] },
  { label: 'Semester 4', num: 4, color: '#7c3aed', codes: ['MOD7BW', 'MOD11', 'MOD17'] },
  { label: 'Semester 5', num: 5, color: '#be123c', codes: ['MOD15', 'MOD16'] },
];

const AME_SKIP = ['FDN', 'GEN'];
let allSections = [];
let allModules  = [];

(function init() {
  const d = Store.get(KEYS.STUDENTS);
  if (!d || !d.students) return;

  const { sections, modules } = computeModuleSections(d.students, (item, type) => {
    if (type === 'student') return item.programTab === 'AB & HD AME';
    if (type === 'module')  return !AME_SKIP.some(p => item.code.toUpperCase().startsWith(p));
    return true;
  });

  allSections = sections;

  const moduleByCode = {};
  for (const m of modules) moduleByCode[m.code.toUpperCase()] = m;

  allModules = [];
  for (const sem of SEMESTERS)
    for (const code of sem.codes) {
      const m = moduleByCode[code.toUpperCase()];
      if (m) allModules.push(m);
    }

  const secHeaders = allSections.map(s =>
    `<th style="text-align:center;white-space:nowrap;">Sec ${s}</th>`).join('');

  let rowNum = 0;
  const cardsHTML = SEMESTERS.map(sem => {
    const semModules = sem.codes
      .map(c => moduleByCode[c.toUpperCase()])
      .filter(Boolean);

    if (!semModules.length) return '';

    const rows = semModules.map(m => {
      rowNum++;
      const sectionCells = allSections.map(s => {
        const count = m.sections[s] || 0;
        if (!count) return `<td style="text-align:center;"><span style="color:#ddd;">—</span></td>`;
        const over = count >= 28;
        return `<td style="text-align:center;"><span class="ms-count${over ? ' ms-count-over' : ''}">${count}</span></td>`;
      }).join('');

      return `<tr>
        <td style="text-align:center;color:#aaa;width:32px;">${rowNum}</td>
        <td style="font-weight:700;color:#8B0010;white-space:nowrap;">${esc(m.code)}</td>
        <td style="white-space:normal;word-break:break-word;">${esc(m.name)}</td>
        ${sectionCells}
        <td style="text-align:center;font-weight:700;">${m.total}</td>
      </tr>`;
    }).join('');

    return `
      <div class="sem-card">
        <div class="sem-card-header">
          <div class="sem-avatar" style="background:${sem.color};">${sem.num}</div>
          <div class="sem-card-info">
            <span class="sem-card-title">${esc(sem.label)}</span>
          </div>
        </div>
        <div class="sem-card-body">
          <table class="sem-card-table">
            <thead>
              <tr>
                <th style="width:32px;">#</th>
                <th style="white-space:nowrap;">Code</th>
                <th>Module Name</th>
                ${secHeaders}
                <th style="text-align:center;">Total</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }).join('');

  document.getElementById('tableWrap').innerHTML =
    `<div class="sem-cards-container">${cardsHTML}</div>`;

  const total = allModules.length;
  document.getElementById('modCount').textContent = `${total} module${total !== 1 ? 's' : ''}`;
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('tableWrap').style.display  = 'block';
  document.getElementById('pdfBtn').style.display     = 'flex';
})();

function downloadPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFontSize(13);
  doc.setTextColor(27, 58, 92);
  doc.text('AME Module Tracker — AB & HD Aircraft Maintenance Engineering', 14, 14);
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(`Generated: ${new Date().toLocaleString('en-GB')}  |  ${allModules.length} modules`, 14, 20);

  const moduleByCode = {};
  for (const m of allModules) moduleByCode[m.code.toUpperCase()] = m;

  const head = [['#', 'Code', 'Module Name', ...allSections.map(s => `Sec ${s}`), 'Total']];
  const body = [];
  let rowNum = 0;

  for (const sem of SEMESTERS) {
    const colCount = 3 + allSections.length + 1;
    body.push([{
      content: sem.label,
      colSpan: colCount,
      styles: { fillColor: hexToRgb(sem.color), textColor: [255, 255, 255], fontStyle: 'bold' }
    }]);
    for (const code of sem.codes) {
      const m = moduleByCode[code.toUpperCase()];
      if (!m) continue;
      rowNum++;
      body.push([rowNum, m.code, m.name, ...allSections.map(s => m.sections[s] || '—'), m.total]);
    }
  }

  doc.autoTable({
    head, body, startY: 24,
    styles:     { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [27, 58, 92], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 8,  halign: 'center' },
      1: { cellWidth: 22, fontStyle: 'bold', textColor: [139, 0, 16] },
      2: { cellWidth: 'auto' },
      ...Object.fromEntries(allSections.map((_, i) => [i + 3, { cellWidth: 14, halign: 'center' }])),
      [allSections.length + 3]: { cellWidth: 14, halign: 'center', fontStyle: 'bold' }
    },
    alternateRowStyles: { fillColor: [248, 249, 252] },
    didParseCell(data) {
      if (data.section === 'body' && data.column.index >= 3) {
        const val = parseInt(data.cell.raw);
        if (!isNaN(val) && val >= 28 && data.column.index < allSections.length + 3) {
          data.cell.styles.textColor = [192, 57, 43];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    }
  });

  doc.save('AME_Module_Tracker.pdf');
}

function hexToRgb(hex) {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
