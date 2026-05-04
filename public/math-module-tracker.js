// math-module-tracker.js — Math Modules Tracker (GitHub Pages static version)
// Depends on: storage.js, parser.js (loaded in HTML)

const MATH_ENG = new Set(['ENG1000', 'ENG1100', 'ENG1200', 'ENG3250', 'ENG3260', 'ENG2220']);

let allModules  = [];
let allSections = [];

(function init() {
  const d = Store.get(KEYS.STUDENTS);
  if (!d || !d.students) return;

  const { sections, modules } = computeModuleSections(d.students, (item, type) => {
    if (type === 'module') {
      const cu = item.code.toUpperCase();
      return cu.startsWith('MA') || MATH_ENG.has(cu);
    }
    return true;
  });

  allSections = sections;
  allModules  = modules;

  buildHeader(allSections);
  renderTable(allModules);

  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('tableWrap').style.display  = 'block';
  document.getElementById('filterBar').style.display  = 'flex';
  document.getElementById('pdfBtn').style.display     = 'flex';
})();

function buildHeader(sections) {
  const secColPct = Math.min(6, Math.floor(40 / sections.length));
  document.getElementById('sectionsHead').innerHTML = `<tr>
    <th style="width:3%;">#</th>
    <th style="width:8%;">Code</th>
    <th>Module Name</th>
    ${sections.map(s => `<th style="width:${secColPct}%;text-align:center;">Sec ${s}</th>`).join('')}
    <th style="width:6%;text-align:center;">Total</th>
  </tr>`;
}

function renderTable(modules) {
  document.getElementById('modCount').textContent =
    `${modules.length} module${modules.length !== 1 ? 's' : ''}`;

  document.getElementById('sectionsBody').innerHTML = modules.map((m, i) => `
    <tr>
      <td style="text-align:center;color:#aaa;">${i + 1}</td>
      <td style="font-weight:700;color:#8B0010;white-space:nowrap;">${esc(m.code)}</td>
      <td style="white-space:normal;word-break:break-word;">${esc(m.name)}</td>
      ${allSections.map(s => {
        const count = m.sections[s] || 0;
        return `<td style="text-align:center;">${count > 0
          ? `<span class="ms-count">${count}</span>`
          : '<span style="color:#ddd;">—</span>'}</td>`;
      }).join('')}
      <td style="text-align:center;font-weight:700;">${m.total}</td>
    </tr>`).join('');

  document.getElementById('filterCount').textContent =
    modules.length < allModules.length ? `Showing ${modules.length} of ${allModules.length}` : '';
}

function applyFilter() {
  const q = document.getElementById('codeFilter').value.trim().toUpperCase();
  renderTable(q ? allModules.filter(m => m.code.toUpperCase().includes(q)) : allModules);
}

function clearFilter() {
  document.getElementById('codeFilter').value = '';
  renderTable(allModules);
}

function downloadPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const q = document.getElementById('codeFilter').value.trim().toUpperCase();
  const modules = q ? allModules.filter(m => m.code.toUpperCase().includes(q)) : allModules;

  doc.setFontSize(13); doc.setTextColor(27, 58, 92);
  doc.text('All Math Module Tracker', 14, 14);
  doc.setFontSize(8); doc.setTextColor(120, 120, 120);
  doc.text(`Generated: ${new Date().toLocaleString('en-GB')}  |  ${modules.length} modules`, 14, 20);

  const head = [['#', 'Code', 'Module Name', ...allSections.map(s => `Sec ${s}`), 'Total']];
  const body = modules.map((m, i) => [i+1, m.code, m.name, ...allSections.map(s => m.sections[s]||'—'), m.total]);

  doc.autoTable({
    head, body, startY: 24,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [27, 58, 92], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 22, fontStyle: 'bold', textColor: [139, 0, 16] },
      2: { cellWidth: 'auto' },
      ...Object.fromEntries(allSections.map((_, i) => [i+3, { cellWidth: 14, halign: 'center' }])),
      [allSections.length + 3]: { cellWidth: 14, halign: 'center', fontStyle: 'bold' }
    },
    alternateRowStyles: { fillColor: [248, 249, 252] }
  });

  doc.save('Math_Modules_Tracker.pdf');
}

function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
