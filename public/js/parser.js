// parser.js — client-side Excel parsing (replaces src/services/)
// Requires: SheetJS (XLSX) loaded before this script.

// ── Shared utilities (from utils.js) ─────────────────────────────────────────

function clean(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 13 || c === 10) {
      if (out.length && out[out.length - 1] !== '/') out += '/';
    } else {
      out += s[i];
    }
  }
  return out.replace(/  +/g, ' ').trim();
}

function colOf(row, candidates) {
  const targets = candidates.map(c => c.toUpperCase().trim());
  for (let j = 0; j < row.length; j++) {
    const v = clean(String(row[j] ?? '')).toUpperCase();
    if (targets.includes(v)) return j;
  }
  return -1;
}

// ── Student file parser (from studentService.js) ──────────────────────────────

const STUDENT_SHEETS = [
  { tab: 'EDAE',                   label: 'Extended Diploma in Aeronautical Engineering'  },
  { tab: 'BSAE',                   label: 'BSc in Aeronautical Engineering'               },
  { tab: 'AB & HD AME',            label: 'AB / HD in Aircraft Maintenance Engineering'   },
  { tab: 'Aerospace (AB & BEng)',  label: 'AB / BEng in Aerospace Engineering'            },
  { tab: 'Avionics (AB & BEng)',   label: 'AB / BEng in Avionics Engineering'             },
  { tab: 'Mechanical (AB & BEng)', label: 'AB / BEng in Mechanical Engineering'           },
];

function _parseStudentSheet(workbook, sheetConfig) {
  const ws = workbook.Sheets[sheetConfig.tab];
  if (!ws) return [];

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  if (!rows.length) return [];

  let hdr = -1;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    for (let j = 0; j < rows[i].length; j++) {
      if (clean(String(rows[i][j] ?? '')).toUpperCase() === 'STUDENT NAME') { hdr = i; break; }
    }
    if (hdr !== -1) break;
  }
  if (hdr === -1) return [];

  const headerRow = rows[hdr];
  const COL = {
    id:      colOf(headerRow, ['STUDENT ID', 'ID NUMBER', 'ID NO.', 'ID NO']),
    name:    colOf(headerRow, ['STUDENT NAME', 'STUDENT NAMES']),
    expGrad: colOf(headerRow, ['EXP. GRAD.', 'EXP. GRAD', 'EXP GRAD', 'EXPECTED GRAD.']),
    status:  colOf(headerRow, ['QS STATUS', 'STATUS']),
    program: colOf(headerRow, ['PROGRAM', 'PROGRAMME']),
    mode:    colOf(headerRow, ['MODE']),
    finance: colOf(headerRow, ['FINANCE COMMENT', 'FINANCE COMMENTS']),
    numMods: colOf(headerRow, ['#']),
    semester:colOf(headerRow, ['SEMESTER', 'SEMESTER - COHORT', 'SEMESTER- COHORT']),
    remarks: colOf(headerRow, ['REMARKS', 'REMARK']),
  };

  const modStart = COL.numMods !== -1 ? COL.numMods + 1 : 10;
  const modEnd   = COL.semester !== -1 ? COL.semester - 1
                 : COL.remarks  !== -1 ? COL.remarks  - 1
                 : headerRow.length    - 1;

  const codesRow = hdr >= 1 ? rows[hdr - 1] : [];
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
    const row     = rows[i];
    const rawName = clean(String(row[COL.name] ?? ''));
    if (!rawName) continue;

    const rawId = clean(String(row[COL.id] ?? ''));
    const modules = [];
    for (const mod of modList) {
      const cell = row[mod.col];
      if (cell === null || cell === undefined || cell === '') continue;
      const sec = parseInt(String(cell));
      if (!isNaN(sec) && sec >= 1 && sec <= 9)
        modules.push({ code: mod.code, name: mod.name, section: sec });
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

function parseStudentFile(arrayBuffer) {
  const wb          = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const allStudents = [];
  const summary     = [];

  for (const cfg of STUDENT_SHEETS) {
    if (!wb.SheetNames.includes(cfg.tab)) {
      summary.push({ tab: cfg.tab, count: 0, found: false });
      continue;
    }
    const list = _parseStudentSheet(wb, cfg);
    allStudents.push(...list);
    summary.push({ tab: cfg.tab, label: cfg.label, count: list.length, found: true });
  }

  return { generated: new Date().toISOString(), total: allStudents.length, summary, students: allStudents };
}

// ── Attendance file parser (from attendanceService.js) ────────────────────────

const SEMESTER_START_MS   = Date.UTC(2026, 0, 19); // 19 Jan 2026
const SPRING_BREAK_END_MS = Date.UTC(2026, 2, 20); // 20 Mar 2026
const SPRING_BREAK_DAYS   = 14;


function _parseTimeCol(val) {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const m = val.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      const mins = parseInt(m[1]) * 60 + parseInt(m[2]) + (m[3] ? parseInt(m[3]) / 60 : 0);
      return mins / 1440;
    }
  }
  return 0;
}

// Convert a date cell (Excel serial number OR string) to an Excel serial.
// Returns null if the value is not parseable as a date.
function _toDateSerial(val) {
  if (typeof val === 'number' && isFinite(val)) return Math.floor(val);
  if (typeof val === 'string' && val.trim()) {
    const s = val.trim();
    // ISO: YYYY-MM-DD or YYYY/MM/DD
    let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (m) {
      const ms = Date.UTC(+m[1], +m[2] - 1, +m[3]);
      return Math.floor(ms / 86400000) + 25569;
    }
    // DD/MM/YYYY or DD-MM-YYYY (assume day-first since that's the EAU locale)
    m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
    if (m) {
      const ms = Date.UTC(+m[3], +m[2] - 1, +m[1]);
      return Math.floor(ms / 86400000) + 25569;
    }
    // Fallback: let JS try
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      return Math.floor(ms / 86400000) + 25569;
    }
  }
  return null;
}

function _serialToISO(serial) {
  return new Date((serial - 25569) * 86400 * 1000).toISOString().slice(0, 10);
}

function parseAttendanceFile(arrayBuffer, filename) {
  let wb;
  if (/\.csv$/i.test(filename || '')) {
    // Decode as UTF-8 text, stripping BOM if present
    let bytes = new Uint8Array(arrayBuffer);
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      bytes = bytes.subarray(3);
    }
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    wb = XLSX.read(text, { type: 'string', cellDates: false });
  } else {
    wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  }
  if (!wb || !wb.SheetNames || !wb.SheetNames.length) {
    throw new Error('Could not read the file. Check that it is a valid CSV or XLSX.');
  }

  let dataRows = null;
  const moduleSheetRows = [];
  const ATT_VALUES = new Set(['absent', 'late', 'present']);

  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null });

    // Find the column that holds Absent/Late/Present (case-insensitive). Defaults to column G (index 6).
    let attCol = -1;
    for (let i = 0; i < Math.min(rows.length, 31); i++) {
      if (!rows[i]) continue;
      for (let j = 0; j < rows[i].length; j++) {
        const v = String(rows[i][j] ?? '').trim().toLowerCase();
        if (ATT_VALUES.has(v)) { attCol = j; break; }
      }
      if (attCol !== -1) break;
    }
    if (attCol !== -1) {
      dataRows = rows;
      dataRows._attCol = attCol;
      continue;
    }

    let moduleHits = 0;
    for (let i = 1; i < Math.min(rows.length, 15); i++) {
      const r = rows[i];
      if (r && r[1] != null && typeof r[2] === 'number' && r[2] > 0) moduleHits++;
    }
    if (moduleHits >= 3) moduleSheetRows.push(rows);
  }

  if (!dataRows) {
    const sheets = wb.SheetNames.join(', ');
    let sample = '';
    if (wb.SheetNames.length) {
      const r = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
      if (r.length > 1) sample = ' First row: ' + JSON.stringify(r[1]).slice(0, 250);
    }
    throw new Error(`Could not detect attendance data. Sheets: [${sheets}]. Need a column with Absent/Late/Present values.${sample}`);
  }
  const attCol = dataRows._attCol != null ? dataRows._attCol : 6;

  // Build module map
  let modMap = {};
  if (moduleSheetRows.length > 0) {
    const mrows = moduleSheetRows[0];
    for (let i = 1; i < mrows.length; i++) {
      const [modName, code, sessions] = mrows[i];
      if (code) modMap[String(code).trim().toUpperCase()] = {
        name:     String(modName  || '').trim(),
        sessions: Number(sessions || 0)
      };
    }
  } else {
    // Fall back to cached module map from localStorage
    const cached = Store.get(KEYS.MODULES);
    if (cached) modMap = cached;
  }

  let minDateSerial = Infinity;
  let maxDateSerial = -Infinity;
  const groups = {};

  for (let i = 1; i < dataRows.length; i++) {
    const row        = dataRows[i];
    const courseCode = clean(String(row[0]  ?? ''));
    const courseDesc = clean(String(row[1]  ?? ''));
    const modCode    = clean(String(row[3]  ?? ''));
    const modTitle   = clean(String(row[4]  ?? ''));
    const tutDate    = row[5];
    const attendance = clean(String(row[attCol] ?? '')).toLowerCase();
    const studentId  = clean(String(row[8]  ?? ''));
    const firstName  = clean(String(row[9]  ?? ''));
    const lastName   = clean(String(row[10] ?? ''));
    const startTime  = _parseTimeCol(row[12]);
    const endTime    = _parseTimeCol(row[13]);

    if (!studentId || !modCode) continue;

    const dateSerial = _toDateSerial(tutDate);

    // Skip Spring Break: 9 March – 20 March (inclusive)
    if (dateSerial !== null) {
      const d = new Date((dateSerial - 25569) * 86400000);
      const m = d.getUTCMonth() + 1, day = d.getUTCDate();
      if (m === 3 && day >= 9 && day <= 20) continue;

      if (dateSerial < minDateSerial) minDateSerial = dateSerial;
      if (dateSerial > maxDateSerial) maxDateSerial = dateSerial;
    }

    const key = `${studentId}|${modCode}`;
    if (!groups[key]) {
      groups[key] = {
        studentId,
        name:      `${firstName} ${lastName}`.trim(),
        courseCode,
        program:   courseDesc,
        modCode,
        modTitle,
        absCount:  0,
        lateCount: 0,
        absences:  []
      };
    }

    if (attendance === 'absent') {
      groups[key].absCount++;
      if (dateSerial !== null) {
        groups[key].absences.push({ date: _serialToISO(dateSerial) });
      }
    } else if (attendance === 'late') {
      groups[key].lateCount++;
    }
  }

  const moduleWarnings = {};
  const allModules     = {};

  for (const g of Object.values(groups)) {
    const mapKey  = g.modCode.toUpperCase();
    const modInfo = modMap[mapKey];
    if (!modInfo || modInfo.sessions === 0) continue;

    const totalSessions = modInfo.sessions;
    const effAbs = g.absCount + Math.floor(g.lateCount / 3);
    const warnPct = (effAbs / totalSessions) * 100;

    const studentRecord = {
      id:           g.studentId,
      name:         g.name,
      courseCode:   g.courseCode,
      program:      g.program,
      absences:     g.absCount,
      lates:        g.lateCount,
      effAbsences:  effAbs,
      warnPct:      Math.round(warnPct * 10) / 10,
      absenceDates: g.absences.slice().sort((a, b) => a.date.localeCompare(b.date))
    };

    if (!allModules[g.modCode]) {
      allModules[g.modCode] = {
        moduleCode: g.modCode,
        moduleName: g.modTitle || modInfo.name,
        totalSessions,
        students:   []
      };
    }
    allModules[g.modCode].students.push(studentRecord);

    if (warnPct <= 10) continue;

    if (!moduleWarnings[g.modCode]) {
      moduleWarnings[g.modCode] = {
        moduleCode:   g.modCode,
        moduleName:   g.modTitle || modInfo.name,
        totalSessions,
        students:     []
      };
    }
    moduleWarnings[g.modCode].students.push(studentRecord);
  }

  const modules = Object.values(moduleWarnings)
    .sort((a, b) => a.moduleCode.localeCompare(b.moduleCode))
    .map(m => ({ ...m, students: m.students.sort((a, b) => b.warnPct - a.warnPct) }));

  const uniqueFlagged = new Set(modules.flatMap(m => m.students.map(s => s.id))).size;

  let weekNumber = 1;
  if (maxDateSerial !== -Infinity) {
    const maxMs  = (maxDateSerial - 25569) * 86400 * 1000;
    let daysDiff = Math.floor((maxMs - SEMESTER_START_MS) / 86400000);
    if (maxMs > SPRING_BREAK_END_MS) daysDiff -= SPRING_BREAK_DAYS;
    weekNumber = Math.max(1, Math.floor(daysDiff / 7) + 1);
  }

  const allModulesList = Object.values(allModules)
    .sort((a, b) => a.moduleCode.localeCompare(b.moduleCode))
    .map(m => ({ ...m, students: m.students.sort((a, b) => b.warnPct - a.warnPct) }));

  return {
    modMap,
    generated:    new Date().toISOString(),
    dateRange:    minDateSerial !== Infinity
                    ? { min: _serialToISO(minDateSerial), max: _serialToISO(maxDateSerial) }
                    : null,
    weekNumber,
    totalModules: modules.length,
    totalFlagged: uniqueFlagged,
    modules,
    allModules:   allModulesList
  };
}

// ── Grading file parser (from gradingService.js) ──────────────────────────────

const GRADE_COLS = ['A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'F', 'W/I'];
const GRADE_MAP  = {
  'A':'A', 'B+':'B+', 'B':'B', 'C+':'C+', 'C':'C', 'D+':'D+', 'D':'D', 'F':'F',
  'W':'W/I', 'W/I':'W/I', 'WITHDRAWN':'W/I',
  'I':'W/I', 'IN':'W/I', 'INCOMPLETE':'W/I'
};

function parseGradingFile(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' });

  let records     = null;
  let modules     = null;
  let warningData = null;
  let sheetData   = null;

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

    // ── Grades sheet ─────────────────────────────────────────────────────────
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

      // Full sheet rows for module-grading page
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
      sheetData = { headers: hdrOrig, rows: sheetRows };

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
        const toNum = ci => {
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

    // ── Warning data sheet ────────────────────────────────────────────────────
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
    }
  }

  if (!records || !records.length)
    throw new Error('Grades sheet not found. One sheet must have "Module" and "Grade" columns.');
  if (!modules || !modules.length)
    throw new Error('Modules sheet not found. One sheet must have "Code" and "Module" columns.');

  return { records, modules, warningData: warningData || [], sheetData };
}

// ── Grade analysis computation (from gradingService.js) ───────────────────────

function _normName(s) {
  return s.toLowerCase().replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

function _buildMetaLookup(metaList) {
  const exact = {}, norm = {};
  for (const m of metaList) {
    exact[m.module.toLowerCase()] = m;
    norm[_normName(m.module)]     = m;
  }
  return { exact, norm, list: metaList };
}

function _findMeta(lookup, moduleName) {
  const lo = moduleName.toLowerCase();
  if (lookup.exact[lo]) return lookup.exact[lo];
  const n = _normName(moduleName);
  if (lookup.norm[n]) return lookup.norm[n];
  for (const [key, meta] of Object.entries(lookup.norm)) {
    if (key.startsWith(n) || n.startsWith(key)) return meta;
  }
  return null;
}

function computeGradeAnalysis(records, metaList) {
  const lookup  = _buildMetaLookup(metaList);
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
    const meta       = _findMeta(lookup, moduleName);
    const grades     = data.grades;
    const total      = GRADE_COLS.reduce((s, g) => s + grades[g], 0);
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

  return {
    generated:     new Date().toISOString(),
    totalModules:  modules.length,
    totalStudents: modules.reduce((s, m) => s + m.total, 0),
    modules
  };
}

// ── Module section computation (from moduleService.js) ────────────────────────

function computeModuleSections(students, filterFn) {
  const moduleMap = {};
  for (const student of students) {
    if (filterFn && !filterFn(student, 'student')) continue;
    for (const mod of student.modules) {
      if (filterFn && !filterFn(mod, 'module')) continue;
      if (!moduleMap[mod.code]) moduleMap[mod.code] = { code: mod.code, name: mod.name, sections: {} };
      moduleMap[mod.code].sections[mod.section] = (moduleMap[mod.code].sections[mod.section] || 0) + 1;
    }
  }

  const allSections = new Set();
  for (const m of Object.values(moduleMap))
    for (const s of Object.keys(m.sections)) allSections.add(parseInt(s));

  const sections = Array.from(allSections).sort((a, b) => a - b);
  const modules  = Object.values(moduleMap)
    .map(m => ({ ...m, total: sections.reduce((s, sec) => s + (m.sections[sec] || 0), 0) }))
    .sort((a, b) => a.code.localeCompare(b.code));

  return { sections, modules };
}
