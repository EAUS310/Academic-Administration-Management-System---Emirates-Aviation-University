// modules-detail.js — Module Reference Table (GitHub Pages static version)
// Depends on: storage.js (loaded in HTML)

(function init() {
  const data = Store.get(KEYS.MODULES);
  if (!data) return;

  const entries = Object.entries(data)
    .map(([code, info]) => ({ code, name: info.name, sessions: info.sessions }))
    .sort((a, b) => a.code.localeCompare(b.code));

  if (!entries.length) return;

  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('tableWrap').style.display  = 'block';
  document.getElementById('modCount').textContent     = `${entries.length} module${entries.length !== 1 ? 's' : ''}`;

  const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  document.getElementById('modulesBody').innerHTML = entries.map(e => `
    <tr>
      <td class="att-id">${esc(e.code)}</td>
      <td>${esc(e.name)}</td>
      <td style="text-align:center;">${e.sessions}</td>
    </tr>`).join('');
})();
