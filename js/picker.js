/* A select that stays usable at 155 options.
 *
 * The market page listed every currency as a filter button in a wrapping row.
 * That reads fine at fifteen and falls apart at a hundred and fifty-five: the
 * row becomes a wall, and finding a currency means scanning it. This is the
 * same control as a <select>, with a search box over the options and a subtitle
 * line, so "Bhutan" or "ngultrum" finds αιBTN as readily as the ticker does.
 *
 * Native <select> was the other option. It cannot show a second line per row,
 * and its type-ahead only matches the start of the label — which is the one
 * thing that does not help when every label starts with the same two letters.
 */
(function (global) {
  const esc = (v) => String(v == null ? '' : v)
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let seq = 0;

  /**
   * @param host     element to render into
   * @param opts.items    [{ value, label, sub, keywords }]
   * @param opts.value    currently selected value, or null for "all"
   * @param opts.allLabel label for the null option; omit to make a choice required
   * @param opts.placeholder search box placeholder
   * @param opts.empty    text when the search matches nothing
   * @param opts.onChange fired with the new value
   */
  function mount(host, opts) {
    if (!host) return null;
    const id = 'pk' + (++seq);
    let items = opts.items || [];
    let value = opts.value == null ? null : opts.value;
    let open = false;
    let active = -1;          // index into `shown`, for keyboard
    let shown = items;

    host.classList.add('picker');
    host.innerHTML = `
      <button type="button" class="picker-btn" id="${id}-btn"
              aria-haspopup="listbox" aria-expanded="false">
        <span class="picker-val" id="${id}-val"></span>
        <span class="picker-caret" aria-hidden="true">▾</span>
      </button>
      <div class="picker-pop" id="${id}-pop" hidden>
        <input class="picker-search" id="${id}-q" type="text" autocomplete="off"
               spellcheck="false" placeholder="${esc(opts.placeholder || 'Search')}"
               aria-controls="${id}-list">
        <div class="picker-list" id="${id}-list" role="listbox" tabindex="-1"></div>
      </div>`;

    const btn = host.querySelector('#' + id + '-btn');
    const val = host.querySelector('#' + id + '-val');
    const pop = host.querySelector('#' + id + '-pop');
    const q = host.querySelector('#' + id + '-q');
    const list = host.querySelector('#' + id + '-list');

    function current() { return items.find((i) => i.value === value) || null; }

    function drawButton() {
      const c = current();
      val.textContent = c ? c.label : (opts.allLabel || '');
      btn.classList.toggle('picked', !!c);
    }

    function match(item, needle) {
      if (!needle) return true;
      const hay = (item.label + ' ' + (item.sub || '') + ' ' + (item.keywords || '')).toLowerCase();
      return hay.includes(needle);
    }

    function drawList() {
      const needle = q.value.trim().toLowerCase();
      shown = items.filter((i) => match(i, needle));
      /* The "all" row is part of the list, not a separate control, so one set
         of arrow keys walks every choice including clearing the filter. */
      const rows = [];
      if (opts.allLabel && !needle) {
        rows.push({ value: null, label: opts.allLabel, sub: '', all: true });
      }
      shown = rows.concat(shown);
      if (!shown.length) {
        list.innerHTML = `<p class="picker-empty">${esc(opts.empty || 'No match')}</p>`;
        active = -1;
        return;
      }
      if (active >= shown.length) active = shown.length - 1;
      list.innerHTML = shown.map((i, n) => `
        <div class="picker-opt${i.value === value ? ' on' : ''}${n === active ? ' active' : ''}"
             role="option" aria-selected="${i.value === value}" data-n="${n}">
          <span class="picker-opt-label">${esc(i.label)}</span>
          ${i.sub ? `<span class="picker-opt-sub">${esc(i.sub)}</span>` : ''}
        </div>`).join('');
    }

    function scrollActive() {
      const el = list.querySelector('.picker-opt.active');
      if (el) el.scrollIntoView({ block: 'nearest' });
    }

    function setOpen(next) {
      open = next;
      pop.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      if (open) {
        q.value = '';
        active = -1;
        drawList();
        q.focus();
      }
    }

    function choose(n) {
      const item = shown[n];
      if (!item) return;
      value = item.value;
      drawButton();
      setOpen(false);
      btn.focus();
      if (opts.onChange) opts.onChange(value);
    }

    btn.addEventListener('click', () => setOpen(!open));
    q.addEventListener('input', () => { active = -1; drawList(); });

    q.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { setOpen(false); btn.focus(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!shown.length) return;
        active = e.key === 'ArrowDown'
          ? Math.min(shown.length - 1, active + 1)
          : Math.max(0, active - 1);
        drawList();
        scrollActive();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        choose(active >= 0 ? active : 0);
      }
    });

    list.addEventListener('click', (e) => {
      const opt = e.target.closest('.picker-opt[data-n]');
      if (opt) choose(Number(opt.dataset.n));
    });
    list.addEventListener('mousemove', (e) => {
      const opt = e.target.closest('.picker-opt[data-n]');
      if (!opt || Number(opt.dataset.n) === active) return;
      active = Number(opt.dataset.n);
      list.querySelectorAll('.picker-opt.active').forEach((el) => el.classList.remove('active'));
      opt.classList.add('active');
    });

    /* Close on an outside click or a focus that leaves the control. Without
       the focusout half, tabbing out leaves an open panel over the page. */
    const onDocDown = (e) => { if (open && !host.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDocDown);
    host.addEventListener('focusout', () => {
      setTimeout(() => { if (open && !host.contains(document.activeElement)) setOpen(false); }, 0);
    });

    drawButton();

    return {
      /** Swap the option list — the node decides which currencies exist, and
          that arrives after first paint. */
      setItems(next) {
        items = next || [];
        if (value != null && !items.some((i) => i.value === value)) value = null;
        drawButton();
        if (open) drawList();
      },
      get value() { return value; },
      set value(v) { value = v; drawButton(); if (open) drawList(); },
      destroy() { document.removeEventListener('mousedown', onDocDown); },
    };
  }

  global.AistPicker = { mount };
})(window);
