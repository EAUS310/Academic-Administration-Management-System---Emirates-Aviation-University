// attendance-push.js — Attendance Push page
// Computes the minimum set of "Absent → Present" conversions (earliest dates first)
// needed to get each student under the attendance warning threshold (<25%).
// Lates are not converted (per requirement), but they still count toward warning %.

const THRESHOLD = 25;

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

let allData = null;
let pushRows = [];           // flat list of {studentId, modCode, ..., flipDates, ...}
let msStudents, msPrograms, msModules;

try {
  const d = Store.get(KEYS.ATTENDANCE_ALL);
  if (d && d.generated) {
    document.getElementById('infoStatus').textContent =
      `Last updated: ${new Date(d.generated).toLocaleString()}`;
    loadPushData();
  }
} catch (e) {
  console.error('[attendance-push] load failed:', e);
}

// ── Upload flow (shared with other attendance pages) ─────────────────────────
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
  selectedFile.style.display = 'none'; selectedFile.textContent = '';
  uploadBtn.disabled = true;
  progressWrap.style.display = 'none'; progressBar.style.width = '0';
  uploadResult.style.display = 'none';
  dropZone.style.display = 'block';
}
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) pickFile(f); });
fileInput.addEventListener('change', () => { if (fileInput.files[0]) pickFile(fileInput.files[0]); });
function pickFile(f) {
  const lower = f.name.toLowerCase();
  if (!lower.endsWith('.xlsx') && !lower.endsWith('.csv')) { alert('Please select a .xlsx or .csv file.'); return; }
  chosenFile = f;
  selectedFile.style.display = 'block';
  selectedFile.innerHTML = `<strong>Selected:</strong> ${f.name} &nbsp; <span style="color:#aaa">${(f.size/1024).toFixed(1)} KB</span>`;
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
    if (Object.keys(modMap).length) Store.set(KEYS.MODULES, modMap);
    Store.set(KEYS.ATTENDANCE,     summary);
    Store.set(KEYS.ATTENDANCE_ALL, { ...summary, modules: allModules });
    uploadResult.style.display = 'block';
    uploadResult.innerHTML = `<div class="result-ok" style="margin-bottom:0;">&#10003; Parsed successfully &mdash; loaded ${allModules.length} modules.</div>`;
    document.getElementById('infoStatus').textContent = 'Last updated: just now';
    loadPushData();
  } catch (err) {
    progressBar.style.background = '#dc3545';
    uploadResult.style.display = 'block';
    uploadResult.innerHTML = `<div class="result-err">&#10007; ${err.message}</div>`;
  } finally {
    uploadBtn.disabled = false;
  }
}

// ── Push computation ─────────────────────────────────────────────────────────
//
// For each student-module record we compute:
//   - thresholdPct: 10 (AME program) or 25 (others)
//   - currentPct: existing rec.warnPct (kept as-is, includes lates contribution)
//   - flips: list of absence entries to convert (earliest-first, smallest set
//            that brings the warn% strictly below threshold)
//   - newPct: warn% after the suggested flips
//
// Metric: effective absences = absences + floor(lates/3).
// We only convert absences (per requirement); lates remain.
function computePush(rec, totalSessions) {
  const target  = (THRESHOLD / 100) * totalSessions; // strict upper bound
  const absList = (rec.absenceDates || []).slice().sort((a, b) => a.date.localeCompare(b.date));

  const lateContrib = Math.floor((rec.lates || 0) / 3);
  let burden = (rec.absences || 0) + lateContrib;

  const currentPct = totalSessions > 0 ? (burden / totalSessions) * 100 : 0;

  if (currentPct < THRESHOLD - 1e-9) {
    return { thresholdPct: THRESHOLD, currentPct, newPct: currentPct, flips: [], status: 'already-below' };
  }

  let remaining = burden;
  const flips = [];
  for (const abs of absList) {
    if (remaining < target - 1e-9) break;
    remaining -= 1;
    flips.push(abs);
  }

  const newPct = totalSessions > 0 ? (remaining / totalSessions) * 100 : 0;
  // If after flipping every absence we still can't drop below threshold,
  // lates alone are pushing them over — flag as unreachable.
  const status = newPct < THRESHOLD - 1e-9 ? 'pushable' : 'unreachable';
  return { thresholdPct: THRESHOLD, currentPct, newPct, flips, status };
}

function buildPushRows(modules) {
  const out = [];
  for (const m of modules) {
    for (const s of m.students) {
      const plan = computePush(s, m.totalSessions);
      if (plan.status === 'already-below') continue;
      out.push({
        studentId:    s.id,
        studentName:  s.name,
        program:      s.program,
        moduleCode:   m.moduleCode,
        moduleName:   m.moduleName,
        totalSessions: m.totalSessions,
        absences:     s.absences,
        lates:        s.lates,
        currentPct:   Math.round(plan.currentPct * 10) / 10,
        thresholdPct: plan.thresholdPct,
        newPct:       Math.round(plan.newPct * 10) / 10,
        flipCount:    plan.flips.length,
        flipDates:    plan.flips,
        status:       plan.status
      });
    }
  }
  out.sort((a, b) => {
    if (a.studentId !== b.studentId) return a.studentId.localeCompare(b.studentId);
    return a.moduleCode.localeCompare(b.moduleCode);
  });
  return out;
}

// ── Page lifecycle ───────────────────────────────────────────────────────────
function loadPushData() {
  const data = Store.get(KEYS.ATTENDANCE_ALL);
  if (!data || data.noData || !Array.isArray(data.modules)) return;

  allData = data;

  // Detect stale data parsed before per-absence dates were tracked.
  // Such records will have absences > 0 but no absenceDates array.
  const stale = data.modules.some(m => m.students.some(s =>
    s.absences > 0 && (!Array.isArray(s.absenceDates) || s.absenceDates.length === 0)
  ));
  if (stale) {
    const info = document.getElementById('infoStatus');
    info.innerHTML = `<span style="color:#C8102E;font-weight:700;">&#9888; Re-upload attendance data to enable date suggestions</span>`;
  }

  pushRows = buildPushRows(data.modules);

  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('pushArea').style.display   = '';
  document.getElementById('filterBar').style.display  = '';
  document.getElementById('excelBtn').style.display   = pushRows.length ? '' : 'none';

  populateFilters();
  applyFilters();
}

function populateFilters() {
  const studentIds = new Set(), programs = new Set(), modCodes = new Set();
  for (const r of pushRows) {
    studentIds.add(r.studentId);
    programs.add(r.program);
    modCodes.add(r.moduleCode);
  }
  msStudents = new MultiSelect('ms-students', 'Select student IDs...');
  msStudents.setOptions([...studentIds].sort());
  msPrograms = new MultiSelect('ms-programs', 'Select programs...');
  msPrograms.setOptions([...programs].sort());
  msModules = new MultiSelect('ms-modules', 'Select module codes...');
  msModules.setOptions([...modCodes].sort());
}

function resetFilters() {
  [msStudents, msPrograms, msModules].forEach(ms => ms && ms.clear());
  applyFilters();
}

function applyFilters() {
  const selStudents = msStudents ? msStudents.getSelected() : [];
  const selPrograms = msPrograms ? msPrograms.getSelected() : [];
  const selModules  = msModules  ? msModules.getSelected()  : [];

  const filtered = pushRows.filter(r => {
    if (selStudents.length && !selStudents.includes(r.studentId)) return false;
    if (selPrograms.length && !selPrograms.includes(r.program)) return false;
    if (selModules.length  && !selModules.includes(r.moduleCode)) return false;
    return true;
  });

  renderSummary(filtered);
  renderRows(filtered);
}

function renderSummary(rows) {
  const studentSet  = new Set(rows.map(r => r.studentId));
  const totalFlips  = rows.reduce((s, r) => s + r.flipCount, 0);
  const unreachable = rows.filter(r => r.status === 'unreachable').length;

  const strip = document.getElementById('summaryStrip');
  strip.innerHTML = `
    <div class="card"><div class="lbl">Students Affected</div><div class="val">${studentSet.size}</div></div>
    <div class="card"><div class="lbl">Module Records</div><div class="val">${rows.length}</div></div>
    <div class="card danger"><div class="lbl">Total Absences to Flip</div><div class="val">${totalFlips}</div></div>
    ${unreachable ? `<div class="card danger"><div class="lbl">Unreachable (lates alone over)</div><div class="val">${unreachable}</div></div>` : ''}
  `;
}

function renderRows(rows) {
  const list = document.getElementById('pushList');
  const noPush = document.getElementById('noPushNeeded');

  if (!rows.length) {
    list.innerHTML = '';
    noPush.style.display = '';
    return;
  }
  noPush.style.display = 'none';

  // Group by student
  const byStudent = new Map();
  for (const r of rows) {
    if (!byStudent.has(r.studentId)) {
      byStudent.set(r.studentId, {
        id: r.studentId, name: r.studentName, program: r.program, modules: []
      });
    }
    byStudent.get(r.studentId).modules.push(r);
  }

  list.innerHTML = [...byStudent.values()].map(stu => `
    <div class="push-student-block">
      <div class="push-student-hdr">
        <span class="sid">${esc(stu.id)}</span>
        <span class="sname">${esc(stu.name)}</span>
        <span class="stier">&lt; 25%</span>
        <span class="sprog">${esc(stu.program)}</span>
      </div>
      <table class="push-table">
        <thead>
          <tr>
            <th>Module</th>
            <th class="nowrap">Sessions</th>
            <th class="nowrap">Absences</th>
            <th class="nowrap">Lates</th>
            <th class="nowrap">Current %</th>
            <th class="nowrap">Target</th>
            <th class="nowrap"># to Flip</th>
            <th class="nowrap">After Push %</th>
            <th>Dates to Convert (Absent → Present)</th>
          </tr>
        </thead>
        <tbody>
          ${stu.modules.map(m => `
            <tr ${m.status === 'unreachable' ? 'style="background:#fff7f2;"' : ''}>
              <td>
                <div class="modcode">${esc(m.moduleCode)}</div>
                <div class="modname">${esc(m.moduleName)}</div>
              </td>
              <td class="nowrap">${m.totalSessions}</td>
              <td class="nowrap"><strong>${m.absences}</strong></td>
              <td class="nowrap">${m.lates ?? 0}</td>
              <td class="nowrap pct-cur">${m.currentPct}%</td>
              <td class="nowrap" style="color:#888;">&lt; ${m.thresholdPct}%</td>
              <td class="nowrap"><span class="flip-count">${m.flipCount}</span></td>
              <td class="nowrap pct-new">${m.newPct}%${m.status === 'unreachable' ? ' &#9888;' : ''}</td>
              <td class="dates-cell">
                ${m.flipDates.map(d =>
                  `<span class="date-pill">${esc(fmtDate(d.date))}</span>`
                ).join('')}
                ${m.status === 'unreachable' ? '<div style="color:#C8102E;font-size:11px;margin-top:4px;">&#9888; Lates alone exceed threshold &mdash; absence flips alone cannot fix this.</div>' : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `).join('');
}

// ── Excel export ─────────────────────────────────────────────────────────────
function downloadPushExcel() {
  if (!pushRows.length) return;

  const selStudents = msStudents ? msStudents.getSelected() : [];
  const selPrograms = msPrograms ? msPrograms.getSelected() : [];
  const selModules  = msModules  ? msModules.getSelected()  : [];

  const rows = pushRows.filter(r => {
    if (selStudents.length && !selStudents.includes(r.studentId)) return false;
    if (selPrograms.length && !selPrograms.includes(r.program)) return false;
    if (selModules.length  && !selModules.includes(r.moduleCode)) return false;
    return true;
  });

  const header = [
    '#', 'Student ID', 'Student Name', 'Program',
    'Module Code', 'Module Name', 'Total Sessions',
    'Current Absences', 'Lates',
    'Current %', 'Threshold %', 'After Push %',
    '# To Flip', 'Dates to Convert', 'Status'
  ];
  const aoa = [header];
  rows.forEach((r, i) => {
    const dates = r.flipDates.map(d => fmtDate(d.date)).join(', ');
    aoa.push([
      i + 1, r.studentId, r.studentName, r.program,
      r.moduleCode, r.moduleName, r.totalSessions,
      r.absences, r.lates ?? 0,
      `${r.currentPct}%`, `< ${r.thresholdPct}%`, `${r.newPct}%`,
      r.flipCount, dates, r.status === 'unreachable' ? 'UNREACHABLE (lates over)' : 'OK'
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    {wch:5},{wch:11},{wch:24},{wch:30},
    {wch:12},{wch:34},{wch:9},
    {wch:9},{wch:7},
    {wch:10},{wch:11},{wch:11},
    {wch:9},{wch:60},{wch:22}
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance Push');
  const fname = `Attendance_Push_${new Date().toISOString().slice(0,10)}.xlsx`;
  const buf   = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const blob  = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url   = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fname; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Convert a stored ISO date (yyyy-mm-dd) into display format (dd-mm-yyyy).
// Storage stays ISO so sorting still works correctly.
function fmtDate(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
}
