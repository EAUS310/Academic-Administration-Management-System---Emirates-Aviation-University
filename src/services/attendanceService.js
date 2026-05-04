'use strict';

const express = require('express');
const multer  = require('multer');
const XLSX    = require('xlsx');
const fs      = require('fs');
const path    = require('path');
const { clean } = require('./utils');

const router   = express.Router();
const upload   = multer({ storage: multer.memoryStorage() });
const DATA_DIR       = path.join(__dirname, '..', '..', 'data');
const ATTENDANCE_FILE = path.join(DATA_DIR, 'attendance.json');
const ALL_DATA_FILE   = path.join(DATA_DIR, 'attendance-all.json');
const MODULES_FILE    = path.join(DATA_DIR, 'modules.json');

// ─── Semester constants ───────────────────────────────────────────────────────
const SEMESTER_START_MS   = Date.UTC(2026, 0, 19); // 19 Jan 2026
const SPRING_BREAK_END_MS = Date.UTC(2026, 2, 20); // 20 Mar 2026
const SPRING_BREAK_DAYS   = 14;                    // 9 Mar – 20 Mar

// ─── AME detection ────────────────────────────────────────────────────────────
const AME_CODES = new Set(['ABAME01F', 'HDAME021F']);
function isAME(courseCode, courseDesc) {
  if (AME_CODES.has((courseCode || '').trim().toUpperCase())) return true;
  return (courseDesc || '').toUpperCase().includes('AIRCRAFT MAINTENANCE');
}

// ─── Parse time column (Excel numeric fraction or "hh:mm" string) ─────────────
function parseTimeCol(val) {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const m = val.trim().match(/^(\d+):(\d{2})$/);
    if (m) return (parseInt(m[1]) * 60 + parseInt(m[2])) / 1440;
  }
  return 0;
}

// ─── Parse uploaded attendance file (xlsx or csv) ─────────────────────────────
function parseAttendanceFile(buffer, originalname) {
  const wb = /\.csv$/i.test(originalname || '')
    ? XLSX.read(buffer.toString('utf8'), { type: 'string', cellDates: false })
    : XLSX.read(buffer, { type: 'buffer', cellDates: false });

  let dataRows = null;
  const moduleSheetRows = [];

  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null });

    // Detect attendance sheet: column 6 contains Absent/Late/Present
    let isAttendance = false;
    for (let i = 1; i < Math.min(rows.length, 31); i++) {
      const v = String(rows[i][6] || '').trim();
      if (v === 'Absent' || v === 'Late' || v === 'Present') { isAttendance = true; break; }
    }
    if (isAttendance) { dataRows = rows; continue; }

    // Detect module list sheet: col[1]=string, col[2]=positive number, ≥3 such rows
    let moduleHits = 0;
    for (let i = 1; i < Math.min(rows.length, 15); i++) {
      const r = rows[i];
      if (r && r[1] != null && typeof r[2] === 'number' && r[2] > 0) moduleHits++;
    }
    if (moduleHits >= 3) moduleSheetRows.push(rows);
  }

  if (!dataRows) throw new Error('Could not detect attendance data. Ensure column 7 contains Absent / Late / Present values.');

  // Build module map from detected sheet or saved cache
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
    fs.writeFileSync(MODULES_FILE, JSON.stringify(modMap));
    console.log(`Module data saved: ${Object.keys(modMap).length} modules`);
  } else if (fs.existsSync(MODULES_FILE)) {
    modMap = JSON.parse(fs.readFileSync(MODULES_FILE));
    console.log(`Module data loaded from cache: ${Object.keys(modMap).length} modules`);
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
    const attendance = clean(String(row[6]  ?? ''));
    const studentId  = clean(String(row[8]  ?? ''));
    const firstName  = clean(String(row[9]  ?? ''));
    const lastName   = clean(String(row[10] ?? ''));
    const startTime  = parseTimeCol(row[12]);
    const endTime    = parseTimeCol(row[13]);

    if (!studentId || !modCode) continue;

    // Skip Spring Break: 9 March – 20 March (inclusive)
    if (typeof tutDate === 'number') {
      const d = new Date(Math.round((Math.floor(tutDate) - 25569) * 86400000));
      const m = d.getUTCMonth() + 1, day = d.getUTCDate();
      if (m === 3 && day >= 9 && day <= 20) continue;
    }

    if (typeof tutDate === 'number') {
      const serial = Math.floor(tutDate);
      if (serial < minDateSerial) minDateSerial = serial;
      if (serial > maxDateSerial) maxDateSerial = serial;
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
        ame:       isAME(courseCode, courseDesc),
        absCount:  0,
        lateCount: 0,
        missedHrs: 0
      };
    }

    if (attendance === 'Absent') {
      const hrs = (endTime - startTime) * 24;
      groups[key].absCount++;
      groups[key].missedHrs += hrs > 0 ? hrs : 1;
    } else if (attendance === 'Late') {
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
    const isGenModule   = g.modCode.toUpperCase().startsWith('GEN');
    const useAMECalc    = g.ame && !isGenModule;

    let warnPct;
    if (useAMECalc) {
      warnPct = (g.missedHrs / totalSessions) * 100;
    } else {
      const effAbs = g.absCount + Math.floor(g.lateCount / 3);
      warnPct = (effAbs / totalSessions) * 100;
    }

    const studentRecord = {
      id:          g.studentId,
      name:        g.name,
      courseCode:  g.courseCode,
      program:     g.program,
      ame:         useAMECalc,
      absences:    g.absCount,
      lates:       g.lateCount,
      missedHrs:   g.ame ? Math.round(g.missedHrs * 10) / 10 : null,
      effAbsences: g.ame ? null : g.absCount + Math.floor(g.lateCount / 3),
      warnPct:     Math.round(warnPct * 10) / 10
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
        moduleCode:    g.modCode,
        moduleName:    g.modTitle || modInfo.name,
        totalSessions,
        students:      []
      };
    }
    moduleWarnings[g.modCode].students.push(studentRecord);
  }

  const modules = Object.values(moduleWarnings)
    .sort((a, b) => a.moduleCode.localeCompare(b.moduleCode))
    .map(m => ({ ...m, students: m.students.sort((a, b) => b.warnPct - a.warnPct) }));

  const uniqueFlagged = new Set(modules.flatMap(m => m.students.map(s => s.id))).size;

  function serialToISO(serial) {
    return new Date((serial - 25569) * 86400 * 1000).toISOString().slice(0, 10);
  }

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
    generated:    new Date().toISOString(),
    dateRange:    minDateSerial !== Infinity
                    ? { min: serialToISO(minDateSerial), max: serialToISO(maxDateSerial) }
                    : null,
    weekNumber,
    totalModules: modules.length,
    totalFlagged: uniqueFlagged,
    modules,
    allModules:   allModulesList
  };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

router.post('/upload-attendance', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const result = parseAttendanceFile(req.file.buffer, req.file.originalname);
    const { allModules, ...summary } = result;
    fs.writeFileSync(ATTENDANCE_FILE, JSON.stringify(summary));
    fs.writeFileSync(ALL_DATA_FILE, JSON.stringify({ ...summary, modules: allModules }));
    console.log(`Attendance: ${result.totalModules} modules, ${result.totalFlagged} flagged students`);
    res.json({ ok: true, totalModules: result.totalModules, totalFlagged: result.totalFlagged });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/attendance-warnings', (_req, res) => {
  if (!fs.existsSync(ATTENDANCE_FILE)) return res.json({ noData: true });
  res.json(JSON.parse(fs.readFileSync(ATTENDANCE_FILE)));
});

router.get('/attendance-status', (_req, res) => {
  if (!fs.existsSync(ATTENDANCE_FILE)) return res.json({ hasData: false });
  const { generated, totalModules, totalFlagged } = JSON.parse(fs.readFileSync(ATTENDANCE_FILE));
  res.json({ hasData: true, generated, totalModules, totalFlagged });
});

router.get('/attendance-all', (_req, res) => {
  if (!fs.existsSync(ALL_DATA_FILE)) return res.json({ noData: true });
  res.json(JSON.parse(fs.readFileSync(ALL_DATA_FILE)));
});

router.get('/modules', (_req, res) => {
  if (!fs.existsSync(MODULES_FILE)) return res.json({ noData: true });
  res.json(JSON.parse(fs.readFileSync(MODULES_FILE)));
});

module.exports = router;
