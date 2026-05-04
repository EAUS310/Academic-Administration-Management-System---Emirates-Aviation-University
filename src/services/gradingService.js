'use strict';

const express = require('express');
const multer  = require('multer');
const XLSX    = require('xlsx');
const fs      = require('fs');
const path    = require('path');
const { clean } = require('./utils');

const router   = express.Router();
const upload   = multer({ storage: multer.memoryStorage() });
const DATA_DIR        = path.join(__dirname, '..', '..', 'data');
const GRADES_FILE     = path.join(DATA_DIR, 'grades.json');
const GRADES_RAW_FILE = path.join(DATA_DIR, 'grades-raw.json');
const GRADES_META_FILE = path.join(DATA_DIR, 'grades-meta.json');
const GRADES_SHEET_FILE = path.join(DATA_DIR, 'grades-sheet.json');
const WARNING_DATA_FILE = path.join(DATA_DIR, 'warning-data.json');

const GRADE_COLS = ['A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'F', 'W/I'];

const GRADE_MAP = {
  'A':'A', 'B+':'B+', 'B':'B', 'C+':'C+', 'C':'C', 'D+':'D+', 'D':'D', 'F':'F',
  'W':'W/I', 'W/I':'W/I', 'WITHDRAWN':'W/I',
  'I':'W/I', 'IN':'W/I', 'INCOMPLETE':'W/I'
};

// ─── Parse combined grading workbook ─────────────────────────────────────────
function parseGradingFile(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });

  let records     = null;
  let modules     = null;
  let warningData = null;

  for (const sheetName of wb.SheetNames) {
    const ws   = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    let hdrIdx = -1;
    let upper  = [];
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      upper = rows[i].map(c => c !== null ? String(c).trim().toUpperCase() : '');
      if (upper.some(v => v === 'GRADE') || upper.some(v => v === 'CODE') ||
          upper.some(v => v === 'CGPA')  || sheetName.toUpperCase().includes('WARNING')) {
        hdrIdx = i; break;
      }
    }
    if (hdrIdx === -1) continue;

    const hasGrade   = upper.some(v => v === 'GRADE') && upper.some(v => v === 'MODULE');
    const hasMeta    = upper.some(v => v === 'CODE')  && upper.some(v => v === 'MODULE' || v === 'COURSE');
    const hasWarning = upper.some(v => v === 'CGPA')  || sheetName.toUpperCase().includes('WARNING');

    // ── Grades sheet ──────────────────────────────────────────────────────────
    if (hasGrade && !records) {
      const hdr     = rows[hdrIdx].map(c => c !== null ? String(c).trim().toUpperCase() : '');
      const hdrOrig = rows[hdrIdx].map(c => c !== null ? String(c).trim() : '');
      const cModule  = hdr.indexOf('MODULE');
      const cGrade   = hdr.indexOf('GRADE');
      const cTotal   = hdr.indexOf('TOTAL');
      const cId      = hdr.findIndex(v => v === 'ID NUMBER' || v === 'ID' || v.includes('ID'));
      const cFirst   = hdr.findIndex(v => v === 'FIRST NAME' || v === 'FIRSTNAME');
      const cLast    = hdr.findIndex(v => v === 'SURNAME' || v === 'LAST NAME' || v === 'LASTNAME');
      const cAttWarn = hdr.findIndex(v => v.includes('20%') || (v.includes('ATTENDANCE') && v !== 'ATTENDANCE'));
      const cDisc    = hdr.findIndex(v => v.includes('DISCIPLIN'));

      // Detect CW and Final Exam GROSS columns from the super-header row
      let cCwNet = -1, cFinalNet = -1, cCwGross = -1, cFinalGross = -1;
      if (hdrIdx > 0) {
        const superHdr = rows[hdrIdx - 1].map(c => c !== null ? String(c).trim().toUpperCase() : '');
        for (let ci = 0; ci < superHdr.length; ci++) {
          if (superHdr[ci].includes('COURSE') || superHdr[ci].includes('CW')) {
            for (let ni = ci; ni < Math.min(ci + 6, hdr.length); ni++) {
              if (hdr[ni] === 'GROSS' && cCwGross < 0) { cCwGross = ni; }
              if (hdr[ni] === 'NET'   && cCwNet   < 0) { cCwNet   = ni; }
              if (cCwGross >= 0 && cCwNet >= 0) break;
            }
          }
          if (superHdr[ci].includes('FINAL')) {
            for (let ni = ci; ni < Math.min(ci + 6, hdr.length); ni++) {
              if (hdr[ni] === 'GROSS' && cFinalGross < 0) { cFinalGross = ni; }
              if (hdr[ni] === 'NET'   && cFinalNet   < 0) { cFinalNet   = ni; }
              if (cFinalGross >= 0 && cFinalNet >= 0) break;
            }
          }
        }
      }

      // Store full raw sheet for Detailed Module Grading page
      const sheetRows = [];
      for (let i = hdrIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[cModule]) continue;
        const formatted = hdrOrig.map((_, ci) => {
          const val = row[ci];
          if (ci === cAttWarn && (val === 0.2 || val === '0.2')) return '20%';
          return val != null ? String(val).trim() : '';
        });
        sheetRows.push(formatted);
      }
      fs.writeFileSync(GRADES_SHEET_FILE, JSON.stringify({ headers: hdrOrig, rows: sheetRows }));

      records = [];
      for (let i = hdrIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[cModule] || !row[cGrade]) continue;
        const rawGrade = String(row[cGrade]).trim().toUpperCase();
        const grade    = GRADE_MAP[rawGrade] || null;
        if (!grade) continue;
        const firstName = cFirst >= 0 && row[cFirst] ? clean(String(row[cFirst])) : '';
        const lastName  = cLast  >= 0 && row[cLast]  ? clean(String(row[cLast]))  : '';
        const attRaw    = row[cAttWarn] != null ? String(row[cAttWarn]).trim() : '';
        const discRaw   = row[cDisc]    != null ? String(row[cDisc]).trim()    : '';
        const attWarn   = attRaw === '0.2' || attRaw.toUpperCase() === '20%';
        const disc      = discRaw.toUpperCase() === 'Y';
        const totalRaw  = cTotal >= 0 && row[cTotal] != null ? row[cTotal] : null;
        const finalMark = totalRaw !== null && !isNaN(Number(totalRaw))
          ? Math.round(Number(totalRaw) * 10) / 10 : null;
        const toNum = (ci) => {
          if (ci < 0 || row[ci] == null) return null;
          const n = Number(row[ci]);
          return isNaN(n) ? null : Math.round(n * 10) / 10;
        };
        records.push({
          studentId:  cId >= 0 && row[cId] ? String(row[cId]).trim() : '',
          name:       [firstName, lastName].filter(Boolean).join(' '),
          module:     clean(String(row[cModule])),
          grade,
          finalMark,
          cwGross:    toNum(cCwGross),
          cwNet:      toNum(cCwNet),
          finalGross: toNum(cFinalGross),
          finalNet:   toNum(cFinalNet),
          attWarn,
          disc
        });
      }
    }

    // ── Modules metadata sheet ────────────────────────────────────────────────
    if (hasMeta && !modules) {
      const hdr   = rows[hdrIdx].map(c => c !== null ? String(c).trim().toUpperCase() : '');
      const cCode = hdr.indexOf('CODE');
      const cMod  = hdr.findIndex(v => v === 'MODULE' || v === 'COURSE');
      const cProg = hdr.findIndex(v => v === 'PROGRAM');
      const cInst = hdr.findIndex(v => v === 'INSTRUCTOR');

      modules = [];
      for (let i = hdrIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[cCode] || !row[cMod]) continue;
        modules.push({
          code:       clean(String(row[cCode])),
          module:     clean(String(row[cMod])),
          program:    cProg >= 0 && row[cProg] ? clean(String(row[cProg])) : '',
          instructor: cInst >= 0 && row[cInst] ? clean(String(row[cInst])) : ''
        });
      }
    }

    // ── WARNING_DATA sheet ────────────────────────────────────────────────────
    if (hasWarning && !warningData) {
      const hdr  = rows[hdrIdx].map(c => c !== null ? String(c).trim().toUpperCase() : '');
      const cSno  = hdr.findIndex(v => v === 'S. NO' || v === 'S.NO' || v === 'SNO' || v === 'NO');
      const cId   = hdr.findIndex(v => v === 'ID' || v === 'ID NUMBER' || v === 'STUDENT ID');
      const cName = hdr.findIndex(v => v.includes('NAME'));
      const cSem  = hdr.findIndex(v => v === 'SEMESTER' || v === 'SEM');
      const cCrHr = hdr.findIndex(v => v.includes('CR') && v.includes('HR'));
      const cCgpa = hdr.findIndex(v => v === 'CGPA');
      const cAw   = hdr.findIndex(v => v.includes('AW') || v.includes('STATUS'));
      const cDec  = hdr.findIndex(v => v.includes('COUNCIL') || v.includes('DECISION'));

      warningData = [];
      let autoSno = 0;
      for (let i = hdrIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;
        const id = cId >= 0 && row[cId] ? String(row[cId]).trim() : '';
        if (!id) continue;
        autoSno++;
        const cgpaRaw = cCgpa >= 0 && row[cCgpa] != null ? row[cCgpa] : null;
        warningData.push({
          sno:             cSno >= 0 && row[cSno] ? String(row[cSno]).trim() : String(autoSno),
          studentId:       id,
          name:            cName >= 0 && row[cName] ? clean(String(row[cName])) : '',
          semester:        cSem  >= 0 && row[cSem]  ? clean(String(row[cSem]))  : '',
          creditHours:     cCrHr >= 0 && row[cCrHr] != null ? row[cCrHr] : '',
          cgpa:            cgpaRaw !== null && !isNaN(Number(cgpaRaw))
                             ? Math.round(Number(cgpaRaw) * 100) / 100 : null,
          awStatus:        cAw  >= 0 && row[cAw]  ? clean(String(row[cAw]))  : '',
          councilDecision: cDec >= 0 && row[cDec] ? clean(String(row[cDec])) : ''
        });
      }
      fs.writeFileSync(WARNING_DATA_FILE, JSON.stringify(warningData));
    }
  }

  if (!records || !records.length)
    throw new Error('Grades sheet not found. One sheet must have "Module" and "Grade" columns.');
  if (!modules || !modules.length)
    throw new Error('Modules sheet not found. One sheet must have "Code" and "Module" columns.');

  fs.writeFileSync(GRADES_RAW_FILE,  JSON.stringify(records));
  fs.writeFileSync(GRADES_META_FILE, JSON.stringify(modules));
  return { records: records.length, modules: modules.length };
}

// ─── Metadata lookup helpers ──────────────────────────────────────────────────
function normName(s) {
  return s.toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function buildMetaLookup(metaList) {
  const exact = {}, norm = {};
  for (const m of metaList) {
    exact[m.module.toLowerCase()] = m;
    norm[normName(m.module)]      = m;
  }
  return { exact, norm, list: metaList };
}

function findMeta(lookup, moduleName) {
  const lo = moduleName.toLowerCase();
  if (lookup.exact[lo]) return lookup.exact[lo];
  const n = normName(moduleName);
  if (lookup.norm[n]) return lookup.norm[n];
  for (const [key, meta] of Object.entries(lookup.norm)) {
    if (key.startsWith(n) || n.startsWith(key)) return meta;
  }
  return null;
}

// ─── Compute grade analysis from raw data ────────────────────────────────────
function computeGradeAnalysis() {
  if (!fs.existsSync(GRADES_RAW_FILE) || !fs.existsSync(GRADES_META_FILE)) return null;

  const records  = JSON.parse(fs.readFileSync(GRADES_RAW_FILE));
  const metaList = JSON.parse(fs.readFileSync(GRADES_META_FILE));
  const lookup   = buildMetaLookup(metaList);

  const byModule = {};
  for (const rec of records) {
    if (!byModule[rec.module]) {
      byModule[rec.module] = { grades: {}, attWarn: 0, disc: 0 };
      for (const g of GRADE_COLS) byModule[rec.module].grades[g] = 0;
    }
    if (GRADE_COLS.includes(rec.grade)) byModule[rec.module].grades[rec.grade]++;
    if (rec.attWarn) byModule[rec.module].attWarn++;
    if (rec.disc)    byModule[rec.module].disc++;
  }

  const modules = [];
  for (const [moduleName, data] of Object.entries(byModule)) {
    const meta   = findMeta(lookup, moduleName);
    const grades = data.grades;
    const total  = GRADE_COLS.reduce((s, g) => s + grades[g], 0);
    const failCount  = Math.max(0, grades['F'] + grades['D'] + grades['D+'] - data.disc - data.attWarn);
    const failNFPct  = total > 0 ? Math.round((failCount / total) * 1000) / 10 : 0;

    modules.push({
      code:           meta ? meta.code       : '—',
      program:        meta ? meta.program    : '',
      name:           moduleName,
      instructor:     meta ? meta.instructor : '',
      total, grades, failNFPct,
      aboveThreshold: data.attWarn,
      disciplinary:   data.disc
    });
  }

  modules.sort((a, b) => b.failNFPct - a.failNFPct);

  const result = {
    generated:     new Date().toISOString(),
    totalModules:  modules.length,
    totalStudents: modules.reduce((s, m) => s + m.total, 0),
    modules
  };
  fs.writeFileSync(GRADES_FILE, JSON.stringify(result));
  return result;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

router.post('/upload-grades', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const { records, modules } = parseGradingFile(req.file.buffer);
    const result = computeGradeAnalysis();
    console.log(`Grades: ${records} records, ${modules} modules`);
    res.json({ ok: true, records, modules, totalModules: result.totalModules, totalStudents: result.totalStudents });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/grades-analysis', (_req, res) => {
  if (!fs.existsSync(GRADES_FILE)) return res.json({ noData: true });
  res.json(JSON.parse(fs.readFileSync(GRADES_FILE)));
});

router.get('/grades-sheet', (_req, res) => {
  if (!fs.existsSync(GRADES_SHEET_FILE)) return res.json({ noData: true });
  res.json(JSON.parse(fs.readFileSync(GRADES_SHEET_FILE)));
});

router.get('/grades-raw-records', (_req, res) => {
  if (!fs.existsSync(GRADES_RAW_FILE))  return res.json({ noData: true });
  if (!fs.existsSync(GRADES_META_FILE)) return res.json({ noData: true });
  const records  = JSON.parse(fs.readFileSync(GRADES_RAW_FILE));
  const metaList = JSON.parse(fs.readFileSync(GRADES_META_FILE));
  const metaByName = {};
  for (const m of metaList) metaByName[m.module.toLowerCase().trim()] = { code: m.code, program: m.program };
  const slim = records.map(r => ({
    module:     r.module,
    cwGross:    r.cwGross,
    finalGross: r.finalGross,
    grade:      r.grade,
    meta:       metaByName[r.module.toLowerCase().trim()] || {}
  }));
  res.json({ records: slim });
});

router.get('/coursework-analysis', (_req, res) => {
  if (!fs.existsSync(GRADES_RAW_FILE))  return res.json({ noData: true });
  if (!fs.existsSync(GRADES_META_FILE)) return res.json({ noData: true });

  const records  = JSON.parse(fs.readFileSync(GRADES_RAW_FILE));
  const metaList = JSON.parse(fs.readFileSync(GRADES_META_FILE));

  const metaByName = {};
  for (const m of metaList) {
    metaByName[m.module.toLowerCase().trim()] = { code: m.code, program: m.program };
  }

  const byModule = {};
  for (const r of records) {
    const key = r.module;
    if (!byModule[key]) byModule[key] = { total: 0, cwFail: 0, finalFail: 0, overallFail: 0 };
    const m = byModule[key];
    m.total++;
    if (r.cwGross    != null && r.cwGross    < 50) m.cwFail++;
    if (r.finalGross != null && r.finalGross < 50) m.finalFail++;
    if (r.finalMark  != null && r.finalMark  < 60) m.overallFail++;
  }

  const modules = Object.entries(byModule).map(([moduleName, counts]) => {
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

  res.json({ modules });
});

router.get('/warning-report', (_req, res) => {
  if (!fs.existsSync(WARNING_DATA_FILE)) return res.json({ noData: true });
  if (!fs.existsSync(GRADES_RAW_FILE))   return res.json({ noData: true });
  if (!fs.existsSync(GRADES_META_FILE))  return res.json({ noData: true });

  const warnList  = JSON.parse(fs.readFileSync(WARNING_DATA_FILE));
  const gradeRecs = JSON.parse(fs.readFileSync(GRADES_RAW_FILE));
  const metaList  = JSON.parse(fs.readFileSync(GRADES_META_FILE));

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
      return {
        moduleCode:  meta.code       || '',
        moduleName:  g.module,
        instructor:  meta.instructor || 'NA',
        finalMark:   g.finalMark,
        grade:       g.grade
      };
    });
    return { ...w, modules: moduleGrades };
  });

  res.json({ students });
});

router.get('/download-warning-excel', (_req, res) => {
  if (!fs.existsSync(WARNING_DATA_FILE) || !fs.existsSync(GRADES_RAW_FILE) || !fs.existsSync(GRADES_META_FILE))
    return res.status(404).json({ error: 'No data' });

  const warnList  = JSON.parse(fs.readFileSync(WARNING_DATA_FILE));
  const gradeRecs = JSON.parse(fs.readFileSync(GRADES_RAW_FILE));
  const metaList  = JSON.parse(fs.readFileSync(GRADES_META_FILE));

  const gradeByStudent = {};
  for (const r of gradeRecs) {
    if (!r.studentId) continue;
    if (!gradeByStudent[r.studentId]) gradeByStudent[r.studentId] = [];
    gradeByStudent[r.studentId].push({ module: r.module, grade: r.grade, finalMark: r.finalMark });
  }
  const metaByName = {};
  for (const m of metaList) metaByName[m.module.toLowerCase().trim()] = { code: m.code, instructor: m.instructor };

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

  const aoa    = [];
  const merges = [];

  const topHdr = [...LEFT_HDRS.slice(0, LEFT_COLS - 1), 'Row', ...Array(maxMods).fill('Final Grades')];
  topHdr[LEFT_COLS - 1] = '';
  aoa.push(topHdr);
  merges.push({ s: { r: 0, c: LEFT_COLS }, e: { r: 0, c: LEFT_COLS + maxMods - 1 } });

  let rowIdx = 1;
  students.forEach(s => {
    const mods     = s.modules;
    const startRow = rowIdx;
    const instrRow = [s.sno, s.studentId, s.name, s.creditHours, s.cgpa, s.awStatus, s.councilDecision, 'Instructor', ...mods.map(m => m.instructor || 'NA')];
    const modRow   = ['','','','','','','', 'Module',      ...mods.map(m => m.moduleName)];
    const markRow  = ['','','','','','','', 'Final Marks',  ...mods.map(m => m.finalMark != null ? m.finalMark : '')];
    const gradeRow = ['','','','','','','', 'Final Grades', ...mods.map(m => m.grade)];
    aoa.push(instrRow, modRow, markRow, gradeRow);
    [0,1,2,3,4,5,6].forEach(c => merges.push({ s: { r: startRow, c }, e: { r: startRow + 3, c } }));
    rowIdx += 4;
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = merges;
  ws['!cols'] = [
    {wch:6},{wch:12},{wch:28},{wch:8},{wch:7},{wch:12},{wch:18},{wch:13},
    ...Array(maxMods).fill({wch:22})
  ];

  const wb      = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Academic Warning Report');
  const buf     = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const dateStr = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="Academic_Warning_Report_${dateStr}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

router.get('/download-grades-excel', (_req, res) => {
  if (!fs.existsSync(GRADES_FILE)) return res.status(404).json({ error: 'No data' });

  const data    = JSON.parse(fs.readFileSync(GRADES_FILE));
  const modules = data.modules || [];
  const GRADE_ORDER = ['A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'F', 'W/I'];

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
      [idx + 1, m.code, m.program, m.name, m.instructor, total, ...GRADE_ORDER.map(gr => g[gr] || 0), m.aboveThreshold ?? 0, m.disciplinary ?? 0, `${m.failNFPct}%`],
      ['', '', '', '', '', '%', ...GRADE_ORDER.map(gr => pct(gr)), '', '', '']
    );
    MERGE_COLS.forEach(c => merges.push({ s: { r: dataR, c }, e: { r: pctR, c } }));
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = merges;
  ws['!cols'] = [
    {wch:5},{wch:14},{wch:22},{wch:42},{wch:22},{wch:8},
    {wch:7},{wch:7},{wch:7},{wch:7},{wch:7},
    {wch:7},{wch:7},{wch:7},{wch:7},
    {wch:13},{wch:14},{wch:14}
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Grade Analysis');
  const buf     = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const dateStr = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="Grade_Analysis_${dateStr}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

router.get('/download-coursework-excel', (req, res) => {
  if (!fs.existsSync(GRADES_RAW_FILE))  return res.status(404).json({ error: 'No data' });
  if (!fs.existsSync(GRADES_META_FILE)) return res.status(404).json({ error: 'No data' });

  const cwThreshold      = Number(req.query.cwThreshold)      || 50;
  const finalThreshold   = Number(req.query.finalThreshold)   || 50;
  const overallThreshold = Number(req.query.overallThreshold) || 60;

  const records  = JSON.parse(fs.readFileSync(GRADES_RAW_FILE));
  const metaList = JSON.parse(fs.readFileSync(GRADES_META_FILE));
  const metaByName = {};
  for (const m of metaList) metaByName[m.module.toLowerCase().trim()] = { code: m.code, program: m.program };

  const byModule = {};
  for (const r of records) {
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
  const buf     = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const dateStr = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="Coursework_Analysis_${dateStr}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

router.get('/grades-modules', (_req, res) => {
  if (!fs.existsSync(GRADES_META_FILE)) return res.json({ noData: true });
  const meta = JSON.parse(fs.readFileSync(GRADES_META_FILE));
  const map = {};
  for (const m of meta) {
    if (m.code) map[m.code] = { name: m.module, instructor: m.instructor || '' };
  }
  res.json(map);
});

router.get('/grades-status', (_req, res) => {
  const rawReady  = fs.existsSync(GRADES_RAW_FILE);
  const metaReady = fs.existsSync(GRADES_META_FILE);
  const hasData   = fs.existsSync(GRADES_FILE);
  let generated = null, totalModules = 0, totalStudents = 0;
  if (hasData) ({ generated, totalModules, totalStudents } = JSON.parse(fs.readFileSync(GRADES_FILE)));
  res.json({ rawReady, metaReady, hasData, generated, totalModules, totalStudents });
});

module.exports = router;
