// ── Shared Multi-select component ─────────────────────────────────────────────
class MultiSelect {
  constructor(containerId, placeholder, fixedOptions) {
    this.el          = document.getElementById(containerId);
    this.selected    = new Set();
    this.allOpts     = fixedOptions || [];
    this.placeholder = placeholder;
    this._build();
    if (this.allOpts.length) this._renderList(this.allOpts);
  }

  _build() {
    this.el.innerHTML = `
      <div class="ms-control">
        <div class="ms-display"><span class="ms-placeholder">${this.placeholder}</span></div>
        <span class="ms-caret">&#9662;</span>
      </div>
      <div class="ms-panel">
        <input type="text" class="ms-search" placeholder="Search...">
        <div class="ms-list"></div>
      </div>`;
    this._ctrl    = this.el.querySelector('.ms-control');
    this._display = this.el.querySelector('.ms-display');
    this._panel   = this.el.querySelector('.ms-panel');
    this._search  = this.el.querySelector('.ms-search');
    this._list    = this.el.querySelector('.ms-list');
    this._caret   = this.el.querySelector('.ms-caret');

    this._ctrl.addEventListener('click', () => this._togglePanel());
    this._search.addEventListener('input', () => this._filterList());
    this._search.addEventListener('click', e => e.stopPropagation());
    this._list.addEventListener('change', e => {
      if (e.target.type !== 'checkbox') return;
      const v = e.target.value;
      e.target.checked ? this.selected.add(v) : this.selected.delete(v);
      this._updateDisplay();
      applyFilters();
    });
    document.addEventListener('click', e => {
      if (!this.el.contains(e.target)) this._closePanel();
    });
  }

  setOptions(opts) {
    this.allOpts = opts;
    this._renderList(opts);
  }

  _renderList(opts) {
    this._list.innerHTML = opts.length
      ? opts.map(o => `
          <label class="ms-opt">
            <input type="checkbox" value="${esc(o)}"${this.selected.has(o) ? ' checked' : ''}>
            <span>${esc(o)}</span>
          </label>`).join('')
      : '<div class="ms-empty">No options</div>';
  }

  _filterList() {
    const q = this._search.value.toLowerCase();
    this._renderList(q ? this.allOpts.filter(o => o.toLowerCase().includes(q)) : this.allOpts);
  }

  _togglePanel() {
    this._panel.classList.contains('open') ? this._closePanel() : this._openPanel();
  }

  _openPanel() {
    this._panel.classList.add('open');
    this._caret.innerHTML = '&#9652;';
    this._search.focus();
  }

  _closePanel() {
    this._panel.classList.remove('open');
    this._caret.innerHTML = '&#9662;';
    this._search.value = '';
    this._filterList();
  }

  _updateDisplay() {
    if (this.selected.size === 0) {
      this._display.innerHTML = `<span class="ms-placeholder">${this.placeholder}</span>`;
      return;
    }
    const arr = [...this.selected];
    this._display.innerHTML = arr.map(v =>
      `<span class="ms-tag">${esc(v)}<span class="ms-tag-x" data-val="${esc(v)}">&#215;</span></span>`
    ).join('');
    this._display.querySelectorAll('.ms-tag-x').forEach(x => {
      x.addEventListener('click', e => {
        e.stopPropagation();
        const val = x.dataset.val;
        this.selected.delete(val);
        const cb = this._list.querySelector(`input[value="${esc(val)}"]`);
        if (cb) cb.checked = false;
        this._updateDisplay();
        applyFilters();
      });
    });
  }

  getSelected() { return [...this.selected]; }
  clear() { this.selected.clear(); this._renderList(this.allOpts); this._updateDisplay(); }
}
