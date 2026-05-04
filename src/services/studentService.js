'use strict';

const express = require('express');
const multer  = require('multer');
const XLSX    = require('xlsx');
const fs      = require('fs');
const path    = require('path');
const { clean, colOf } = require('./utils');

const router   = express.Router();
const upload   = multer({ storage: multer.memoryStorage() });
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'students.json');

// ─── The 6 program sheets we care about ──────────────────────────────────────
const SHEETS = [
  { tab: 'EDAE',                   label: 'Extended Diploma in Aeronautical Engineering'   },
  { tab: 'BSAE',                   label: 'BSc in Aeronautical Engineering'                },
  { tab: 'AB & HD AME',            label: 'AB / HD in Aircraft Maintenance Engineering'    },
  { tab: 'Aerospace (AB & BEng)',  label: 'AB / BEng in Aerospace Engineering'             },
  { tab: 'Avionics (AB & BEng)',   label: 'AB / BEng in Avionics Engineering'              },
  { tab: 'Mechanical (AB & BEng)', label: 'AB / BEng in Mechanical Engineering'            },
];

// ─── Parse one sheet into an array of student objects ────────────────────────
function parseSheet(workbook, sheetConfig) {
  const ws = workbook.Sheets[sheetConfig.tab];
  if (!ws) return [];

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  if (!rows.length) return [];

  // Find the header row — the row that contains "STUDENT NAME"
  let hdr = -1;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    for (let j = 0; j < rows[i].length; j++) {
      if (clean(String(rows[i][j] ?? '')).toUpperCase() === 'STUDENT NAME') {
        hdr = i;
        break;
      }
    }
    if (hdr !== -1) break;
  }
  if (hdr === -1) return [];

  const headerRow = rows[hdr];

  const COL = {
    id:       colOf(headerRow, ['STUDENT ID', 'ID NUMBER', 'ID NO.', 'ID NO']),
    name:     colOf(headerRow, ['STUDENT NAME', 'STUDENT NAMES']),
    sn:       colOf(headerRow, ['SN', 'S. NO', 'S.NO', 'S NO', 'S. NO.']),
    expGrad:  colOf(headerRow, ['EXP. GRAD.', 'EXP. GRAD', 'EXP GRAD', 'EXPECTED GRAD.']),
    status:   colOf(headerRow, ['QS STATUS', 'STATUS']),
    program:  colOf(headerRow, ['PROGRAM', 'PROGRAMME']),
    mode:     colOf(headerRow, ['MODE']),
    finance:  colOf(headerRow, ['FINANCE COMMENT', 'FINANCE COMMENTS']),
    numMods:  colOf(headerRow, ['#']),
    semester: colOf(headerRow, ['SEMESTER', 'SEMESTER - COHORT', 'SEMESTER- COHORT']),
    remarks:  colOf(headerRow, ['REMARKS', 'REMARK']),
  };

  const modStart = COL.numMods !== -1 ? COL.numMods + 1 : 10;
  const modEnd   = COL.semester !== -1 ? COL.semester - 1
                 : COL.remarks  !== -1 ? COL.remarks  - 1
                 : headerRow.length    - 1;

  // Module codes row = row just above the header row
  const codesRow = hdr >= 1 ? rows[hdr - 1] : [];

  // Module names row = the row (before the header) with the most non-empty
  // strings in the module column range
  let namesRow  = codesRow;
  let bestCount = 0;
  for (let i = 0; i < hdr; i++) {
    let count = 0;
    for (let j = modStart; j <= modEnd; j++) {
      const v = clean(String(rows[i][j] ?? ''));
      if (v.length > 3) count++;
    }
    if (count > bestCount) { bestCount = count; namesRow = rows[i]; }
  }

  const SKIP = ['MODULE ENROLLMENT', 'TO BE REGISTERED', 'SPRING 2026', 'SECTION', 'CURRENT SEMESTER'];
  const modList = [];
  for (let j = modStart; j <= modEnd; j++) {
    const code = clean(String(codesRow[j] ?? ''));
    const name = clean(String(namesRow[j] ?? ''));
    if (!code && !name) continue;
    if (SKIP.some(s => name.toUpperCase().includes(s))) continue;
    modList.push({ col: j, code, name });
  }

  const students = [];
  for (let i = hdr + 1; i < rows.length; i++) {
    const row    = rows[i];
    const rawName = clean(String(row[COL.name] ?? ''));
    if (!rawName) continue;

    const rawId = clean(String(row[COL.id] ?? ''));

    const modules = [];
    for (const mod of modList) {
      const cell = row[mod.col];
      if (cell === null || cell === undefined || cell === '') continue;
      const sec = parseInt(String(cell));
      if (!isNaN(sec) && sec >= 1 && sec <= 9) {
        modules.push({ code: mod.code, name: mod.name, section: sec });
      }
    }

    students.push({
      id:           rawId,
      name:         rawName,
      program:      clean(String(row[COL.program]  ?? '')) || sheetConfig.tab,
      programLabel: sheetConfig.label,
      programTab:   sheetConfig.tab,
      mode:         clean(String(row[COL.mode]     ?? '')),
      status:       clean(String(row[COL.status]   ?? '')),
      expectedGrad: clean(String(row[COL.expGrad]  ?? '')),
      finance:      clean(String(row[COL.finance]  ?? '')),
      semester:     clean(String(row[COL.semester] ?? '')),
      numModules:   modules.length,
      modules,
    });
  }

  return students;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

router.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: false });
    const allStudents = [];
    const summary     = [];

    for (const cfg of SHEETS) {
      if (!wb.SheetNames.includes(cfg.tab)) {
        summary.push({ tab: cfg.tab, count: 0, found: false });
        continue;
      }
      const list = parseSheet(wb, cfg);
      allStudents.push(...list);
      summary.push({ tab: cfg.tab, label: cfg.label, count: list.length, found: true });
      console.log(`  ${cfg.tab}: ${list.length} students`);
    }

    const out = { generated: new Date().toISOString(), total: allStudents.length, summary, students: allStudents };
    fs.writeFileSync(DATA_FILE, JSON.stringify(out));
    console.log(`\nTotal: ${allStudents.length} students saved.\n`);
    res.json({ ok: true, total: allStudents.length, summary });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/search', (req, res) => {
  const q = (req.query.id || '').trim();
  if (!q) return res.json({ results: [] });
  if (!fs.existsSync(DATA_FILE)) return res.json({ results: [], noData: true });
  const { students } = JSON.parse(fs.readFileSync(DATA_FILE));
  const matches = students.filter(s => s.id.toUpperCase() === q.toUpperCase());
  res.json({ results: matches });
});

router.get('/status', (_req, res) => {
  if (!fs.existsSync(DATA_FILE)) return res.json({ hasData: false });
  const { generated, total, summary } = JSON.parse(fs.readFileSync(DATA_FILE));
  res.json({ hasData: true, generated, total, summary });
});

module.exports = router;
