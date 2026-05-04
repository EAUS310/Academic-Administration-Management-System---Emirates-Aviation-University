// exporter.js — client-side Excel generation using SheetJS (replaces exceljs downloads)
// Requires: SheetJS (XLSX) loaded before this script.

function _downloadXlsx(wb, filename) {
  const buf  = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function _dateStr() {
  return new Date().toISOString().slice(0, 10);
}

// ── Grade Analysis Excel ───────────────────────────────────────────────────────
function exportGradesExcel(gradesData) {
  const GRADE_ORDER = ['A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'F', 'W/I'];
  const modules = gradesData.modules || [];

  const sorted = [...modules].sort((a, b) => {
    const prog = (a.program || '').localeCompare(b.program || '');
    return prog !== 0 ? prog : b.failNFPct - a.failNFPct;
  });

  const headerRow = ['#', 'Module Code', 'Program', 'Module Name', 'Instructor',
    'Total Students', ...GRADE_ORDER, '20% Above', 'Disciplinary', '(F+D+D+)%'];
  const aoa    = [headerRow];
  const merges = [];
  const MERGE_COLS = [0, 1, 2, 3, 4, 15, 16, 17];

  sorted.forEach((m, idx) => {
    const g     = m.grades || {};
    const total = m.total  || 0;
    const pct   = gr => total > 0 ? `${Math.round(((g[gr] || 0) / total) * 100)}%` : '0%';
    const dataR = 1 + idx * 2;
    const pctR  = dataR + 1;

    aoa.push(
      [idx + 1, m.code, m.program, m.name, m.instructor, total,
       ...GRADE_ORDER.map(gr => g[gr] || 0), m.aboveThreshold ?? 0, m.disciplinary ?? 0, `${m.failNFPct}%`],
      ['', '', '', '', '', '%', ...GRADE_ORDER.map(gr => pct(gr)), '', '', '']
    );
    MERGE_COLS.forEach(c => merges.push({ s: { r: dataR, c }, e: { r: pctR, c } }));
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = merges;
  ws['!cols'] = [
    {wch:5},{wch:14},{wch:22},{wch:42},{wch:22},{wch:8},
    {wch:7},{wch:7},{wch:7},{wch:7},{wch:7},{wch:7},{wch:7},{wch:7},{wch:7},
    {wch:13},{wch:14},{wch:14}
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Grade Analysis');
  _downloadXlsx(wb, `Grade_Analysis_${_dateStr()}.xlsx`);
}

// ── Coursework Analysis Excel ──────────────────────────────────────────────────
function exportCourseworkExcel(gradesRaw, gradesMeta, options = {}) {
  const cwThreshold      = Number(options.cwThreshold)      || 50;
  const finalThreshold   = Number(options.finalThreshold)   || 50;
  const overallThreshold = Number(options.overallThreshold) || 60;

  const metaByName = {};
  for (const m of gradesMeta)
    metaByName[m.module.toLowerCase().trim()] = { code: m.code, program: m.program };

  const byModule = {};
  for (const r of gradesRaw) {
    const key = r.module;
    if (!byModule[key]) byModule[key] = { total: 0, cwFail: 0, finalFail: 0, overallFail: 0 };
    const m = byModule[key];
    m.total++;
    if (r.cwGross    != null && r.cwGross    < cwThreshold)    m.cwFail++;
    if (r.finalGross != null && r.finalGross < finalThreshold) m.finalFail++;
    if (r.grade === 'F') m.overallFail++;
  }

  const rows = Object.entries(byModule).map(([moduleName, counts]) => {
    const meta = metaByName[moduleName.toLowerCase().trim()] || {};
    return {
      program:     meta.program || '',
      code:        meta.code    || '',
      module:      moduleName,
      total:       counts.total,
      cwFail:      counts.cwFail,
      finalFail:   counts.finalFail,
      overallFail: counts.overallFail
    };
  }).sort((a, b) => b.cwFail - a.cwFail || b.overallFail - a.overallFail);

  const aoa = [
    ['#', 'Program', 'Module Code', 'Module Name', 'Total Students',
     `CW Fail (<${cwThreshold})`, `Final Fail (<${finalThreshold})`, `Overall Fail (<${overallThreshold})`],
    ...rows.map((r, i) => [i + 1, r.program, r.code, r.module, r.total, r.cwFail, r.finalFail, r.overallFail])
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{wch:5},{wch:20},{wch:14},{wch:42},{wch:14},{wch:14},{wch:14},{wch:16}];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Coursework Analysis');
  _downloadXlsx(wb, `Coursework_Analysis_${_dateStr()}.xlsx`);
}

// ── Academic Warning Excel ─────────────────────────────────────────────────────
function exportWarningExcel(warnList, gradeRecs, metaList) {
  const gradeByStudent = {};
  for (const r of gradeRecs) {
    if (!r.studentId) continue;
    if (!gradeByStudent[r.studentId]) gradeByStudent[r.studentId] = [];
    gradeByStudent[r.studentId].push({ module: r.module, grade: r.grade, finalMark: r.finalMark });
  }
  const metaByName = {};
  for (const m of metaList)
    metaByName[m.module.toLowerCase().trim()] = { code: m.code, instructor: m.instructor };

  const students = warnList.map(w => ({
    ...w,
    modules: (gradeByStudent[w.studentId] || []).map(g => {
      const meta = metaByName[g.module.toLowerCase().trim()] || {};
      return { moduleCode: meta.code || '', moduleName: g.module, instructor: meta.instructor || 'NA', finalMark: g.finalMark, grade: g.grade };
    })
  }));

  const LEFT_HDRS = ['S.No', 'ID', 'Full Name', 'Cr. Hr.', 'CGPA', 'AW Status', 'Council Decision', ''];
  const LEFT_COLS = 8;
  const maxMods   = Math.max(...students.map(s => s.modules.length), 1);
  const aoa       = [];
  const merges    = [];

  const topHdr = [...LEFT_HDRS.slice(0, LEFT_COLS - 1), 'Row', ...Array(maxMods).fill('Final Grades')];
  topHdr[LEFT_COLS - 1] = '';
  aoa.push(topHdr);
  merges.push({ s: { r: 0, c: LEFT_COLS }, e: { r: 0, c: LEFT_COLS + maxMods - 1 } });

  let rowIdx = 1;
  students.forEach(s => {
    const mods     = s.modules;
    const startRow = rowIdx;
    aoa.push(
      [s.sno, s.studentId, s.name, s.creditHours, s.cgpa, s.awStatus, s.councilDecision, 'Instructor', ...mods.map(m => m.instructor || 'NA')],
      ['','','','','','','', 'Module',       ...mods.map(m => m.moduleName)],
      ['','','','','','','', 'Final Marks',  ...mods.map(m => m.finalMark != null ? m.finalMark : '')],
      ['','','','','','','', 'Final Grades', ...mods.map(m => m.grade)]
    );
    [0,1,2,3,4,5,6].forEach(c => merges.push({ s: { r: startRow, c }, e: { r: startRow + 3, c } }));
    rowIdx += 4;
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = merges;
  ws['!cols'] = [
    {wch:6},{wch:12},{wch:28},{wch:8},{wch:7},{wch:12},{wch:18},{wch:13},
    ...Array(maxMods).fill({wch:22})
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Academic Warning Report');
  _downloadXlsx(wb, `Academic_Warning_Report_${_dateStr()}.xlsx`);
}

// ── Grade Appeals Excel ────────────────────────────────────────────────────────
function exportAppealsExcel(appeals) {
  const header = [
    '#', 'Date Submitted', 'Module Code', 'Module Name', 'Instructor',
    'Student ID', 'Student Name', 'Payment Confirmed', 'Status',
    'Initial CW', 'Initial Midterm', 'Initial Final', 'Initial Total', 'Initial Grade', 'Initial CGPA',
    'Updated CW', 'Updated Midterm', 'Updated Final', 'Updated Total', 'Updated Grade', 'Final CGPA',
    'Comments', 'Reviewed At'
  ];
  const rows = appeals.map((a, i) => [
    i + 1,
    new Date(a.submittedAt).toLocaleString('en-GB'),
    a.moduleCode,
    a.moduleName        || '',
    a.instructor        || '',
    a.studentId,
    a.studentName,
    a.paymentConfirmed ? 'Yes' : 'No',
    a.status,
    a.initialCoursework || '',
    a.initialMidterm    || '',
    a.initialFinal      || '',
    a.initialTotal      || '',
    a.initialGrade      || '',
    a.initialCGPA       || '',
    a.updatedCoursework || '',
    a.updatedMidterm    || '',
    a.updatedFinal      || '',
    a.updatedTotal      || '',
    a.updatedGrade      || '',
    a.finalCGPA         || '',
    a.comments          || '',
    a.reviewedAt ? new Date(a.reviewedAt).toLocaleString('en-GB') : ''
  ]);

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = [
    {wch:4},{wch:20},{wch:14},{wch:40},{wch:28},
    {wch:14},{wch:28},{wch:18},{wch:12},
    {wch:12},{wch:14},{wch:12},{wch:12},{wch:12},{wch:12},
    {wch:12},{wch:14},{wch:12},{wch:12},{wch:12},{wch:12},
    {wch:40},{wch:20}
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Grade Appeals');
  _downloadXlsx(wb, 'Grade_Appeal_Tracker.xlsx');
}
