(async function () {
  AistUI.mountChrome();
  const box = document.getElementById('markets');
  const search = document.getElementById('q');
  const note = document.getElementById('note');
  const currencyFiltersEl = document.getElementById('currency-filters');
  const networkFiltersEl = document.getElementById('network-filters');
  let rows = [];
  let selectedCurrency = null;
  let selectedNetwork = null;
  let currencyGroups = {}; // { base: [{ network, pair }, ...], ... }

  const FEATURED = [
    'KGST-USDT-TRC20', 'KGST-USDT-ERC20', 'KGST-USDT-BEP20', 'KGST-USDT-TON', 'KGST-USDT-SOL',
    'aiGEL-KGST', 'aiETB-KGST', 'aiBTN-KGST', 'aiGEL-USDT-TRC20', 'POH-USDT-TRC20',
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
  function buildCurrencyGroups() {
    currencyGroups = {};
    for (const m of rows) {
      const base = AistApi.displayOf(m.base);
      if (!currencyGroups[base]) currencyGroups[base] = [];
      const network = getNetworkFromPair(m.pair);
      if (network) {
        currencyGroups[base].push({ network, pair: m.pair });
      }
    }
  }

  function renderCurrencyFilters() {
    const currencies = Object.keys(currencyGroups).sort();
    currencyFiltersEl.innerHTML = currencies.map((base) => {
      const isActive = selectedCurrency === base;
      return `<button class="filter-btn${isActive ? ' active' : ''}" data-currency="${base}" style="padding:6px 12px;border-radius:6px;border:1px solid var(--line);background:${isActive ? 'var(--accent)' : 'transparent'};color:${isActive ? '#000' : 'inherit'};cursor:pointer;font-weight:${isActive ? '600' : '400'}">${base}</button>`;
    }).join('');
    currencyFiltersEl.querySelectorAll('[data-currency]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedCurrency = selectedCurrency === btn.dataset.currency ? null : btn.dataset.currency;
        selectedNetwork = null; // Reset network when currency changes
        renderCurrencyFilters();
        renderNetworkFilters();
        render(search.value);
      });
    });
  }

  function renderNetworkFilters() {
    const wrapper = document.getElementById('network-filters-wrapper');
    if (!selectedCurrency || !currencyGroups[selectedCurrency]) {
      wrapper.style.display = 'none';
      networkFiltersEl.innerHTML = '';
      return;
    }

    const networks = Array.from(new Set(currencyGroups[selectedCurrency].map(x => x.network))).sort();
    if (networks.length <= 1) {
      wrapper.style.display = 'none';
      return;
    }

    wrapper.style.display = 'block';
    networkFiltersEl.innerHTML = networks.map((net) => {
      const isActive = selectedNetwork === net;
      return `<button class="filter-btn${isActive ? ' active' : ''}" data-network="${net}" style="padding:6px 12px;border-radius:6px;border:1px solid var(--line);background:${isActive ? 'var(--accent)' : 'transparent'};color:${isActive ? '#000' : 'inherit'};cursor:pointer;font-weight:${isActive ? '600' : '400'}">${net}</button>`;
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
    let list = rows.filter((m) => !f || m.pair.toLowerCase().includes(f) || AistApi.displayOf(m.base).toLowerCase().includes(f));

    // Apply currency filter
    if (selectedCurrency) {
      list = list.filter((m) => AistApi.displayOf(m.base) === selectedCurrency);
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
