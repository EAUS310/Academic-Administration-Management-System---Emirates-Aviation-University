// grade-appeal.js — Grade Appeal Tracker (GitHub Pages static version)
// Depends on: storage.js, exporter.js (loaded in HTML)

// ── Module autocomplete from stored grades metadata ───────────────────────────
let modulesList = [];

(function loadModulesForAutocomplete() {
  const meta = Store.get(KEYS.GRADES_META);
  if (!meta) return;
  const map = {};
  for (const m of meta) {
    if (m.code) map[m.code] = { name: m.module, instructor: m.instructor || '' };
  }
  modulesList = Object.entries(map)
    .map(([code, info]) => ({ code, name: info.name, instructor: info.instructor }))
    .sort((a, b) => a.code.localeCompare(b.code));
})();

// ── Appeals CRUD ──────────────────────────────────────────────────────────────
let allAppeals = [];

(function loadAppeals() {
  allAppeals = Store.get(KEYS.GRADE_APPEALS) || [];
  renderTable(allAppeals);
})();

function _saveAppeals() {
  Store.set(KEYS.GRADE_APPEALS, allAppeals);
}

function renderTable(appeals) {
  const count = appeals.length;
  document.getElementById('appealCount').textContent =
    count ? `${count} appeal${count !== 1 ? 's' : ''}` : '';

  if (!count) {
    document.getElementById('emptyState').style.display  = 'flex';
    document.getElementById('tableWrap').style.display   = 'none';
    document.getElementById('downloadBtn').style.display = 'none';
    return;
  }

  document.getElementById('emptyState').style.display  = 'none';
  document.getElementById('tableWrap').style.display   = 'block';
  document.getElementById('downloadBtn').style.display = 'flex';

  const rows = [...appeals].reverse();
  document.getElementById('appealsBody').innerHTML = rows.map((a, idx) => `
    <tr>
      <td class="att-id" style="text-align:center;white-space:nowrap;">${rows.length - idx}</td>
      <td style="white-space:nowrap;font-size:12px;">${formatDate(a.submittedAt)}</td>
      <td style="font-weight:700;color:#8B0010;white-space:nowrap;">${esc(a.moduleCode)}</td>
      <td style="word-break:break-word;white-space:normal;">${esc(a.moduleName) || '<span style="color:#bbb;">—</span>'}</td>
      <td class="att-id" style="white-space:nowrap;">${esc(a.studentId)}</td>
      <td style="white-space:nowrap;">${esc(a.studentName)}</td>
      <td>${statusBadge(a.status)}</td>
      <td style="text-align:center;">${a.paymentConfirmed
        ? '<span class="appeal-status appeal-resolved">&#10003; Confirmed</span>'
        : '<span class="appeal-status appeal-pending">Pending</span>'}</td>
      <td style="text-align:center;white-space:nowrap;">
        <button class="btn-review" onclick="openReview(${a.id})" style="margin-right:4px;">
          ${a.status === 'Complete' ? 'View' : 'Review'}
        </button>
        <button class="btn-delete" onclick="deleteAppeal(${a.id})">&#128465;</button>
      </td>
    </tr>`).join('');
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) +
         ' ' + d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
}

function statusBadge(status) {
  const map = {
    'Pending':     'appeal-pending',
    'In Progress': 'appeal-inprogress',
    'Resolved':    'appeal-resolved',
    'Rejected':    'appeal-rejected',
    'Complete':    'appeal-complete'
  };
  return `<span class="appeal-status ${map[status] || 'appeal-pending'}">${esc(status)}</span>`;
}

// ── New entry modal ────────────────────────────────────────────────────────────
function openNewEntry() {
  document.getElementById('modalBg').classList.add('open');
  document.getElementById('fModuleCode').value         = '';
  document.getElementById('fModuleName').value         = '';
  document.getElementById('fInstructor').value         = '';
  document.getElementById('fStudentId').value          = '';
  document.getElementById('fStudentName').value        = '';
  document.getElementById('fPaymentConfirmed').checked = false;
  document.getElementById('formError').style.display   = 'none';
  closeDropdown();
  setTimeout(() => document.getElementById('fModuleCode').focus(), 100);
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modalBg')) return;
  document.getElementById('modalBg').classList.remove('open');
  closeDropdown();
}

// ── Module code autocomplete ───────────────────────────────────────────────────
let acHighlight = -1;

function onCodeInput() {
  const q = document.getElementById('fModuleCode').value.trim().toUpperCase();
  document.getElementById('fModuleName').value = '';
  document.getElementById('fInstructor').value = '';
  acHighlight = -1;

  if (!q) { closeDropdown(); return; }

  const matches = modulesList.filter(m =>
    m.code.toUpperCase().includes(q) || m.name.toUpperCase().includes(q)
  ).slice(0, 8);

  if (!matches.length) { closeDropdown(); return; }

  const dd = document.getElementById('codeDropdown');
  dd.innerHTML = matches.map((m, i) => `
    <div class="ac-item" data-idx="${i}" data-code="${esc(m.code)}" data-name="${esc(m.name)}" data-instructor="${esc(m.instructor)}">
      <span class="ac-code">${esc(m.code)}</span>
      <span class="ac-name">${esc(m.name)}</span>
    </div>`).join('');
  dd.style.display = 'block';
}

function onCodeKeydown(e) {
  const dd    = document.getElementById('codeDropdown');
  const items = dd.querySelectorAll('.ac-item');
  if (!items.length) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    acHighlight = Math.min(acHighlight + 1, items.length - 1);
    highlightItem(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    acHighlight = Math.max(acHighlight - 1, 0);
    highlightItem(items);
  } else if (e.key === 'Enter' && acHighlight >= 0) {
    e.preventDefault();
    items[acHighlight].dispatchEvent(new MouseEvent('mousedown'));
  } else if (e.key === 'Escape') {
    closeDropdown();
  }
}

function highlightItem(items) {
  items.forEach((el, i) => el.classList.toggle('ac-highlighted', i === acHighlight));
  if (acHighlight >= 0) items[acHighlight].scrollIntoView({ block: 'nearest' });
}

function selectModule(code, name, instructor) {
  document.getElementById('fModuleCode').value = code;
  document.getElementById('fModuleName').value = name;
  document.getElementById('fInstructor').value = instructor || '';
  closeDropdown();
}

function closeDropdown() {
  document.getElementById('codeDropdown').style.display = 'none';
  acHighlight = -1;
}

document.addEventListener('click', e => {
  if (!e.target.closest('.appeal-autocomplete-wrap')) closeDropdown();
});

document.getElementById('codeDropdown').addEventListener('mousedown', e => {
  const item = e.target.closest('.ac-item');
  if (!item) return;
  e.preventDefault();
  selectModule(item.dataset.code, item.dataset.name, item.dataset.instructor);
});

// ── Submit new appeal ──────────────────────────────────────────────────────────
function submitAppeal() {
  const moduleCode       = document.getElementById('fModuleCode').value.trim();
  const moduleName       = document.getElementById('fModuleName').value.trim();
  const instructor       = document.getElementById('fInstructor').value.trim();
  const studentId        = document.getElementById('fStudentId').value.trim();
  const studentName      = document.getElementById('fStudentName').value.trim();
  const paymentConfirmed = document.getElementById('fPaymentConfirmed').checked;
  const errEl            = document.getElementById('formError');

  if (!moduleCode || !studentId || !studentName) {
    errEl.textContent = 'Module Code, Student ID and Student Name are required.';
    errEl.style.display = 'block';
    return;
  }
  if (!paymentConfirmed) {
    errEl.textContent = 'Payment confirmation by the Finance Department is required before submitting.';
    errEl.style.display = 'block';
    return;
  }

  errEl.style.display = 'none';

  const appeal = {
    id:               Date.now(),
    submittedAt:      new Date().toISOString(),
    moduleCode:       moduleCode,
    moduleName:       moduleName,
    instructor:       instructor,
    studentId:        studentId,
    studentName:      studentName,
    paymentConfirmed: true,
    status:           'Pending'
  };

  allAppeals.push(appeal);
  _saveAppeals();

  document.getElementById('modalBg').classList.remove('open');
  renderTable(allAppeals);
}

// ── Delete appeal ──────────────────────────────────────────────────────────────
function deleteAppeal(id) {
  const a = allAppeals.find(x => x.id === id);
  if (!a) return;
  if (!confirm(`Delete appeal for ${a.studentName} (${a.moduleCode})?\nThis cannot be undone.`)) return;
  allAppeals = allAppeals.filter(x => x.id !== id);
  _saveAppeals();
  renderTable(allAppeals);
}

// ── Review modal ───────────────────────────────────────────────────────────────
let currentReviewId = null;

function openReview(id) {
  const a = allAppeals.find(x => x.id === id);
  if (!a) return;
  currentReviewId = id;

  document.getElementById('rStudentInfo').value    = `${a.studentId} — ${a.studentName}`;
  document.getElementById('rModuleInfo').value     = `${a.moduleCode}${a.moduleName ? ' — ' + a.moduleName : ''}`;
  document.getElementById('rInitialCW').value      = a.initialCoursework || '';
  document.getElementById('rInitialMidterm').value = a.initialMidterm    || '';
  document.getElementById('rInitialFinal').value   = a.initialFinal      || '';
  document.getElementById('rInitialTotal').value   = a.initialTotal      || '';
  document.getElementById('rInitialGrade').value   = a.initialGrade      || '';
  document.getElementById('rCoursework').value     = a.updatedCoursework || '';
  document.getElementById('rMidterm').value        = a.updatedMidterm    || '';
  document.getElementById('rFinal').value          = a.updatedFinal      || '';
  document.getElementById('rTotal').value          = a.updatedTotal      || '';
  document.getElementById('rUpdatedGrade').value   = a.updatedGrade      || '';
  document.getElementById('rInitialCGPA').value    = a.initialCGPA       || '';
  document.getElementById('rFinalCGPA').value      = a.finalCGPA         || '';
  document.getElementById('rComments').value       = a.comments          || '';
  document.getElementById('reviewError').style.display = 'none';
  document.getElementById('reviewModalBg').classList.add('open');
}

function closeReviewModal(e) {
  if (e && e.target !== document.getElementById('reviewModalBg')) return;
  document.getElementById('reviewModalBg').classList.remove('open');
  currentReviewId = null;
}

function submitReview() {
  if (!currentReviewId) return;
  const errEl = document.getElementById('reviewError');
  errEl.style.display = 'none';

  const idx = allAppeals.findIndex(a => a.id === currentReviewId);
  if (idx === -1) { errEl.textContent = 'Appeal not found.'; errEl.style.display = 'block'; return; }

  allAppeals[idx] = {
    ...allAppeals[idx],
    initialCoursework: document.getElementById('rInitialCW').value.trim(),
    initialMidterm:    document.getElementById('rInitialMidterm').value.trim(),
    initialFinal:      document.getElementById('rInitialFinal').value.trim(),
    initialTotal:      document.getElementById('rInitialTotal').value.trim(),
    initialGrade:      document.getElementById('rInitialGrade').value.trim(),
    initialCGPA:       document.getElementById('rInitialCGPA').value.trim(),
    updatedCoursework: document.getElementById('rCoursework').value.trim(),
    updatedMidterm:    document.getElementById('rMidterm').value.trim(),
    updatedFinal:      document.getElementById('rFinal').value.trim(),
    updatedTotal:      document.getElementById('rTotal').value.trim(),
    updatedGrade:      document.getElementById('rUpdatedGrade').value.trim(),
    finalCGPA:         document.getElementById('rFinalCGPA').value.trim(),
    comments:          document.getElementById('rComments').value.trim(),
    status:            'Complete',
    reviewedAt:        new Date().toISOString()
  };

  _saveAppeals();
  document.getElementById('reviewModalBg').classList.remove('open');
  currentReviewId = null;
  renderTable(allAppeals);
}

// ── Excel download ─────────────────────────────────────────────────────────────
function downloadExcel() {
  if (!allAppeals.length) return;
  exportAppealsExcel(allAppeals);
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
