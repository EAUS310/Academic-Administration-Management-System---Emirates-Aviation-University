/* Schedule Extractor — client-side PDF split + rename + manifest.
   Reads the student ID printed on each page, writes one <id>.pdf per student,
   flags blank schedules, and builds a downloadable manifest. No server. */
(function () {
  'use strict';

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  const EMAIL_DOMAIN = 'eau.ac.ae';
  const $ = id => document.getElementById(id);

  // In-memory result of the last run
  const state = { rows: [], files: {} /* id.pdf -> Uint8Array */, filter: 'all' };

  const matchesFilter = (r, f) =>
    f === 'all' ? true :
    f === 'issues' ? (r.status === 'noid' || r.dup) :
    r.status === f;

  // ── helpers ───────────────────────────────────────────────────────────────
  // A page counts as having a schedule if ANY class card is present — regardless
  // of whether a module code, name, instructor or venue is shown. We do this by
  // stripping the fixed scaffold (title, campus line, student header, footer,
  // day labels and time tokens); if any text remains, there is a card.
  const DAY = /^(mon|tue|tues|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)$/i;
  function hasCard(text, id) {
    let t = text
      .replace(/FOE & AME Schedule[^\n]*/gi, ' ')
      .replace(/Emirates Aviation University[^\n]*/gi, ' ')
      .replace(/Timetable generated[^\n]*/gi, ' ')
      .replace(/aSc Timetables Online/gi, ' ');
    if (id) t = t.replace(new RegExp('[^\\n]*' + id + '[^\\n]*', 'g'), ' '); // student header line
    t = t.replace(/\b\d{1,2}:\d{2}\b/g, ' ');                               // time tokens
    return t.split(/\s+/).filter(Boolean).filter(w => !DAY.test(w)).some(w => /[A-Za-z]/.test(w));
  }

  // Rebuild text lines from pdf.js text items by grouping on y-position.
  function linesFromItems(items) {
    const buckets = [];
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const y = it.transform[5];
      let b = buckets.find(b => Math.abs(b.y - y) <= 2.5);
      if (!b) { b = { y, items: [] }; buckets.push(b); }
      b.items.push(it);
    }
    buckets.sort((a, b) => b.y - a.y); // top → bottom
    return buckets.map(b =>
      b.items.sort((a, c) => a.transform[4] - c.transform[4])
             .map(i => i.str).join(' ').replace(/\s+/g, ' ').trim());
  }

  // First 8-digit token on the page is the student ID; name precedes " - <id>".
  function parseHeader(lines) {
    for (const ln of lines) {
      const m = ln.match(/(.*?)\s*-\s*(\d{8})\b/);
      if (m) {
        const name = m[1].replace(/[^A-Za-z'.\- ]/g, '').replace(/\s+/g, ' ').trim();
        return { id: m[2], name };
      }
      const m2 = ln.match(/\b(\d{8})\b/);
      if (m2) return { id: m2[1], name: '' };
    }
    return { id: null, name: '' };
  }

  function setProgress(done, total, label) {
    $('progressWrap').style.display = 'block';
    $('progressBar').style.width = total ? Math.round((done / total) * 100) + '%' : '0%';
    $('statusLine').textContent = label || '';
  }

  function csvEscape(s) {
    s = String(s == null ? '' : s);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  // ── main pipeline ───────────────────────────────────────────────────────────
  async function process(buf, fileName) {
    $('results').classList.add('se-hidden');
    state.rows = []; state.files = {}; state.filter = 'all';
    document.querySelectorAll('.se-filter').forEach(b => b.classList.toggle('active', b.dataset.filter === 'all'));

    // 1) Extract per-page text (pdf.js)
    const doc = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
    const n = doc.numPages;
    const pageInfo = [];
    for (let p = 1; p <= n; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const lines = linesFromItems(tc.items);
      const { id, name } = parseHeader(lines);
      pageInfo.push({ page: p, id, name, card: hasCard(lines.join('\n'), id) });
      if (p % 5 === 0 || p === n) setProgress(p, n, `Reading schedules… ${p}/${n}`);
      await Promise.resolve();
    }

    // 2) Group by student ID; pick the page that actually has courses
    const byId = new Map();
    pageInfo.forEach((r, i) => {
      const key = r.id || `UNKNOWN_p${r.page}`;
      if (!byId.has(key)) byId.set(key, { id: r.id, recs: [] });
      byId.get(key).recs.push(r);
    });

    // 3) Split with pdf-lib
    const src = await PDFLib.PDFDocument.load(buf.slice(0));
    const rows = [];
    let i = 0;
    for (const [key, g] of byId) {
      i++;
      const chosen = g.recs.find(r => r.card) || g.recs[0];
      const name = g.recs.map(r => r.name).find(Boolean) || '';
      let status = g.recs.some(r => r.card) ? 'ready' : 'held';
      if (!g.id) status = 'noid';
      else if (g.recs.length > 1) status = status === 'held' ? 'held' : 'ready'; // resolved
      const isDup = g.recs.length > 1;

      const out = await PDFLib.PDFDocument.create();
      const [pg] = await out.copyPages(src, [chosen.page - 1]);
      out.addPage(pg);
      const bytes = await out.save();

      const safeId = g.id || key;
      const pdfName = `${safeId}.pdf`;
      state.files[pdfName] = bytes;

      rows.push({
        id: g.id || '', name, page: chosen.page, pdf: pdfName,
        email: g.id ? `${g.id}@${EMAIL_DOMAIN}` : '',
        status, dup: isDup, pages: g.recs.map(r => r.page),
      });
      if (i % 5 === 0 || i === byId.size) setProgress(i, byId.size, `Splitting PDFs… ${i}/${byId.size}`);
      await Promise.resolve();
    }

    rows.sort((a, b) => {
      const rank = s => ({ ready: 0, held: 1, noid: 2 }[s.status]);
      return rank(a) - rank(b) || a.id.localeCompare(b.id);
    });
    state.rows = rows;
    setProgress(1, 1, '');
    $('progressWrap').style.display = 'none';
    render(n);
  }

  // ── render ──────────────────────────────────────────────────────────────────
  function render(totalPages) {
    const rows = state.rows;
    const ready = rows.filter(r => r.status === 'ready').length;
    const held  = rows.filter(r => r.status === 'held').length;
    const noid  = rows.filter(r => r.status === 'noid').length;
    const dups  = rows.filter(r => r.dup).length;

    $('stPages').textContent = totalPages;
    $('stStudents').textContent = rows.length;
    $('stReady').textContent = ready;
    $('stHeld').textContent = held;
    $('stIssues').textContent = noid + dups;

    // filter-bar counts
    $('cAll').textContent = rows.length;
    $('cReady').textContent = ready;
    $('cHeld').textContent = held;
    $('cIssues').textContent = noid + dups;

    $('statusLine').textContent =
      `${rows.length} students • ${ready} with schedule • ${held} blank` +
      (noid ? ` • ${noid} with no detectable ID` : '') +
      (dups ? ` • ${dups} appeared on multiple pages (resolved to the page with courses)` : '');

    renderTable();
    $('results').classList.remove('se-hidden');
  }

  function renderTable() {
    const badge = s => ({
      ready: '<span class="se-badge ready">Ready</span>',
      held:  '<span class="se-badge held">Blank</span>',
      noid:  '<span class="se-badge noid">No ID found</span>',
    }[s]);

    const shown = state.rows.filter(r => matchesFilter(r, state.filter));
    const body = $('resBody');
    if (!shown.length) {
      body.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#aaa;padding:22px;">No students in this filter.</td></tr>`;
      return;
    }
    body.innerHTML = shown.map((r, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${r.id || '—'}</td>
        <td>${r.name || '<span style="color:#bbb">(no name)</span>'}</td>
        <td>${r.dup ? `${r.page} <span class="se-badge dup" title="appears on pages ${r.pages.join(', ')}">dup</span>` : r.page}</td>
        <td>${r.email || '—'}</td>
        <td>${badge(r.status)}</td>
      </tr>`).join('');
  }

  window.setFilter = function (f, btn) {
    state.filter = f;
    document.querySelectorAll('.se-filter').forEach(b => b.classList.toggle('active', b === btn));
    renderTable();
  };

  // ── manifest builders ─────────────────────────────────────────────────────
  function manifestCsv() {
    const head = 'id,name,email,pdf,status,page';
    const lines = state.rows.map(r =>
      [r.id, csvEscape(r.name), r.email, r.pdf, r.status, r.page].join(','));
    return head + '\n' + lines.join('\n');
  }

  function triggerDownload(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  window.downloadManifest = function (fmt) {
    if (!state.rows.length) return;
    if (fmt === 'csv') {
      triggerDownload(new Blob([manifestCsv()], { type: 'text/csv;charset=utf-8' }), 'manifest.csv');
    } else {
      const data = state.rows.map(r => ({
        id: r.id, name: r.name, email: r.email, pdf: r.pdf, status: r.status, page: r.page,
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      ws['!autofilter'] = { ref: ws['!ref'] };
      ws['!cols'] = [{ wch: 12 }, { wch: 38 }, { wch: 26 }, { wch: 16 }, { wch: 9 }, { wch: 6 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Schedules');
      XLSX.writeFile(wb, 'manifest.xlsx');
    }
  };

  window.downloadZip = async function () {
    if (!state.rows.length) return;
    const btn = $('btnZip'); btn.disabled = true;
    const useFolders = $('optFolders').checked;
    const includeManifest = $('optManifestInZip').checked;
    try {
      const zip = new JSZip();
      for (const r of state.rows) {
        const folder = useFolders ? (r.status === 'ready' ? 'ready/' : 'held/') : '';
        zip.file(folder + r.pdf, state.files[r.pdf]);
      }
      if (includeManifest) zip.file('manifest.csv', manifestCsv());
      setProgress(0, 1, 'Building ZIP…'); $('progressWrap').style.display = 'block';
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' },
        m => setProgress(m.percent, 100, `Building ZIP… ${Math.round(m.percent)}%`));
      triggerDownload(blob, 'student_schedules.zip');
      $('progressWrap').style.display = 'none'; $('statusLine').textContent = '';
    } catch (e) {
      $('statusLine').textContent = 'ZIP failed: ' + e.message;
    } finally { btn.disabled = false; }
  };

  // ── input wiring ──────────────────────────────────────────────────────────
  async function handleFile(file) {
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) { $('statusLine').textContent = 'Please select a PDF file.'; return; }
    $('selectedFile').style.display = 'block';
    $('selectedFile').innerHTML = `📄 <strong>${file.name}</strong> — ${(file.size / 1048576).toFixed(1)} MB`;
    try {
      const buf = await file.arrayBuffer();
      await process(buf, file.name);
    } catch (e) {
      $('progressWrap').style.display = 'none';
      $('statusLine').textContent = 'Could not read this PDF: ' + e.message;
    }
  }

  $('pdfInput').addEventListener('change', e => handleFile(e.target.files[0]));

  // filter buttons
  document.querySelectorAll('.se-filter').forEach(btn =>
    btn.addEventListener('click', () => window.setFilter(btn.dataset.filter, btn)));

  const dz = $('dropZone');
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => {
    e.preventDefault(); dz.classList.add('over');
  }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => {
    e.preventDefault(); dz.classList.remove('over');
  }));
  dz.addEventListener('drop', e => { if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });
})();
