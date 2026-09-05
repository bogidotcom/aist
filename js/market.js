(async function () {
  AistUI.mountChrome();
  const box = document.getElementById('markets');
  const search = document.getElementById('q');
  const note = document.getElementById('note');
  const currencyPickerEl = document.getElementById('currency-picker');
  const networkFiltersEl = document.getElementById('network-filters');
  let rows = [];
  let selectedCurrency = null;   // a wire ticker (aiBTN), not a display label
  let selectedNetwork = null;
  let currencyGroups = {}; // { ticker: [{ network, pair }, ...], ... }
  let picker = null;

  /* Pinned to the top of the table when present. aiGEL was here until the
     chain dropped it; a pair that does not exist is skipped, so a stale entry
     costs nothing but shows nothing either. */
  const FEATURED = [
    'KGST-USDT-TRC20', 'KGST-USDT-ERC20', 'KGST-USDT-BEP20', 'KGST-USDT-TON', 'KGST-USDT-SOL',
    'DAI-USDT-TRC20', 'aiETB-KGST', 'aiBTN-KGST', 'aiBDT-KGST', 'aiPKR-KGST',
  ];

  // Extract network from pair (e.g., "USDT-TRC20" -> "TRC20", "aiGEL-KGST" -> null/on-chain)
  function getNetworkFromPair(pair) {
    const parts = pair.split('-');
    if (parts.length >= 2) {
      const lastPart = parts[parts.length - 1];
      if (['TRC20', 'ERC20', 'BEP20', 'SOL', 'TON', 'BTC', 'ETH', 'SOL'].includes(lastPart)) {
        return lastPart;
      }
    }
    return 'on-chain'; // Pairs without explicit network are on-chain (like aiGEL-KGST)
  }

  // Build currency groups from rows
  /* Keyed by wire ticker. The old version keyed on the display string, which
     works right up until two currencies share one — and it meant the filter
     compared rendered text rather than identity. */
  function buildCurrencyGroups() {
    currencyGroups = {};
    for (const m of rows) {
      if (!currencyGroups[m.base]) currencyGroups[m.base] = [];
      const network = getNetworkFromPair(m.pair);
      if (network) {
        currencyGroups[m.base].push({ network, pair: m.pair });
      }
    }
  }

  /* Options carry the currency's name and countries as a subtitle, so the
     search box matches "Bhutan" and "ngultrum", not only "aiBTN". */
  function currencyOptions() {
    const C = window.AistCurrencies;
    return Object.keys(currencyGroups).sort((a, b) =>
      AistApi.displayOf(a).localeCompare(AistApi.displayOf(b))
    ).map((ticker) => {
      const rec = C && C.meta(ticker);
      return {
        value: ticker,
        label: AistApi.displayOf(ticker),
        sub: rec ? C.subtitle(ticker) : '',
        keywords: ticker + (rec ? ' ' + rec.iso : ''),
      };
    });
  }

  function renderCurrencyFilters() {
    const options = currencyOptions();
    if (!picker) {
      picker = AistPicker.mount(currencyPickerEl, {
        items: options,
        value: selectedCurrency,
        allLabel: AistUI.t('mkt.allCurrencies'),
        placeholder: AistUI.t('mkt.searchCurrency'),
        empty: AistUI.t('mkt.noCurrency'),
        onChange: (v) => {
          selectedCurrency = v;
          selectedNetwork = null; // Reset network when currency changes
          renderNetworkFilters();
          render(search.value);
        },
      });
      return;
    }
    picker.setItems(options);
  }

  function renderNetworkFilters() {
    const wrapper = document.getElementById('network-filters-wrapper');
    if (!selectedCurrency || !currencyGroups[selectedCurrency]) {
      wrapper.style.display = 'none';
      networkFiltersEl.innerHTML = '';
      return;
    }

    const networks = Array.from(new Set(currencyGroups[selectedCurrency].map((x) => x.network))).sort();
    if (networks.length <= 1) {
      wrapper.style.display = 'none';
      return;
    }

    wrapper.style.display = 'block';
    /* --accent and --muted were never defined in app.css, so the "active" chip
       rendered with a transparent background and black text on black. These are
       real classes now, styled off the palette that exists. */
    networkFiltersEl.innerHTML = networks.map((net) => {
      const isActive = selectedNetwork === net;
      return `<button class="net-chip${isActive ? ' on' : ''}" type="button"
        aria-pressed="${isActive}" data-network="${net}">${net}</button>`;
    }).join('');
    networkFiltersEl.querySelectorAll('[data-network]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedNetwork = selectedNetwork === btn.dataset.network ? null : btn.dataset.network;
        render(search.value);
      });
    });
  }

  function render(filter) {
    const f = (filter || '').trim().toLowerCase();
    const C = window.AistCurrencies;
    let list = rows.filter((m) => !f
      || m.pair.toLowerCase().includes(f)
      || AistApi.displayOf(m.base).toLowerCase().includes(f)
      || AistApi.displayOf(m.quote).toLowerCase().includes(f)
      // "Ethiopia" and "birr" should find αιETB pairs, not just "aiETB".
      || (C && (C.matches(m.base, f) || C.matches(m.quote, f))));

    // Apply currency filter
    if (selectedCurrency) {
      list = list.filter((m) => m.base === selectedCurrency);
    }

    // Apply network filter
    if (selectedNetwork) {
      list = list.filter((m) => {
        const network = getNetworkFromPair(m.pair);
        return network === selectedNetwork;
      });
    }

    const feat = [];
    const rest = [];
    const seen = new Set();
    for (const id of FEATURED) {
      const m = list.find((x) => x.pair === id);
      if (m) { feat.push(m); seen.add(m.pair); }
    }
    for (const m of list) if (!seen.has(m.pair)) rest.push(m);
    const ordered = feat.concat(rest);

    if (!ordered.length) {
      box.innerHTML = `<p class="empty">${AistUI.t('mkt.empty')}</p>`;
      return;
    }
    box.innerHTML = `<div class="table-wrap"><table class="pairs">
      <thead><tr>
        <th data-i18n="mkt.pair">${AistUI.t('mkt.pair')}</th>
        <th data-i18n="mkt.last">${AistUI.t('mkt.last')}</th>
        <th data-i18n="mkt.chg">${AistUI.t('mkt.chg')}</th>
        <th></th>
      </tr></thead>
      <tbody>${ordered.map((m) => {
        const href = AistUI.href('exchange') + '?pair=' + encodeURIComponent(m.pair);
        const chg = m.change24h == null ? '—' : ((m.change24h >= 0 ? '+' : '') + (m.change24h * 100).toFixed(2) + '%');
        return `<tr data-href="${href}">
          <td><div class="pair-name">${AistApi.displayOf(m.base)} / ${AistApi.displayOf(m.quote)}
            <small>${m.pair}</small></div></td>
          <td class="num">${AistApi.formatPrice(m.last)}</td>
          <td class="num chg">${chg}</td>
          <td>${m.onchainQuote ? '<span class="badge">on-chain</span>' : ''}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
    box.querySelectorAll('tr[data-href]').forEach((tr) => {
      tr.addEventListener('click', () => { location.href = tr.dataset.href; });
    });
  }

  try {
    const data = await AistApi.fetchMarkets();
    rows = data.markets || [];
    if (data.synthesized) {
      note.hidden = false;
      note.textContent = AistUI.t('mkt.stale');
    }
    buildCurrencyGroups();
    renderCurrencyFilters();
    renderNetworkFilters();
    render(search.value);
  } catch (e) {
    note.hidden = false;
    note.className = 'err';
    note.textContent = AistUI.t('err.api') + ' ' + (e.message || '');
  }

  search.addEventListener('input', () => render(search.value));
})();
