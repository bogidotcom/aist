(async function () {
  AistUI.mountChrome();
  const box = document.getElementById('markets');
  const search = document.getElementById('q');
  const note = document.getElementById('note');
  const currencyPickerEl = document.getElementById('currency-picker');
  const networkFiltersEl = document.getElementById('network-filters');
  const PAGE = 150;
  let rows = [];                 // the pages fetched so far, never "everything"
  let cursor = null;             // resume token from the node; null once drained
  let total = null;              // matching markets on the node, all pages
  let loading = false;
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
     compared rendered text rather than identity.

     Built from the rows on screen, so it only informs the network chips. The
     currency list itself comes from /currencies, which is one small response
     whatever the pair count is. */
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
  let baseAssets = [];
  function currencyOptions() {
    const C = window.AistCurrencies;
    return baseAssets.slice().sort((a, b) =>
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
          // The node filters by base, so picking a currency is a new query, not
          // a narrowing of what happens to be downloaded.
          reload();
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

    /* The node filters by base, so on 0.4.35+ every row already matches and
       this is a no-op. A node older than that ignores ?base= and answers with
       every market, and without this the currency picker would appear to do
       nothing at all. */
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
    renderMore(ordered.length);
  }

  /* Progress and a way to keep going. Showing "150 of 25,420" matters more than
     it looks: without it a filtered-looking table reads as the whole market. */
  function renderMore(shown) {
    const host = document.getElementById('more');
    if (!host) return;
    if (total == null || total <= rows.length) {
      host.innerHTML = rows.length > shown
        ? `<p class="hint">${AistUI.t('mkt.filtered').replace('{n}', shown).replace('{all}', rows.length)}</p>`
        : '';
      return;
    }
    host.innerHTML = `
      <p class="hint">${AistUI.t('mkt.showing')
        .replace('{n}', rows.length.toLocaleString()).replace('{all}', total.toLocaleString())}</p>
      ${cursor ? `<button class="btn btn-ghost" id="more-btn" ${loading ? 'disabled' : ''}>${
        loading ? AistUI.t('mkt.loading') : AistUI.t('mkt.more')}</button>` : ''}`;
    const btn = document.getElementById('more-btn');
    if (btn) btn.onclick = () => loadPage();
  }

  /** Fetch one more page and append it. */
  async function loadPage() {
    if (loading || (rows.length && !cursor)) return;
    loading = true;
    renderMore(rows.length);
    try {
      const data = await AistApi.fetchMarkets({
        base: selectedCurrency || undefined,
        limit: PAGE,
        cursor: cursor || undefined,
      });
      rows = rows.concat(data.markets || []);
      cursor = data.nextCursor;
      total = data.total;
      if (data.synthesized) {
        note.hidden = false;
        note.textContent = AistUI.t('mkt.stale');
      }
      buildCurrencyGroups();
      renderNetworkFilters();
      render(search.value);
    } catch (e) {
      note.hidden = false;
      note.className = 'err';
      note.textContent = AistUI.t('err.api') + ' ' + (e.message || '');
    } finally {
      loading = false;
      renderMore(rows.length);
    }
  }

  /** Start over — a changed filter is a different query, not a smaller slice. */
  function reload() {
    rows = []; cursor = null; total = null;
    box.innerHTML = `<p class="empty">${AistUI.t('mkt.loading')}</p>`;
    return loadPage();
  }

  /* Currencies first. It is one small response no matter how many pairs exist,
     and it is what the picker needs — deriving the currency list from the
     market rows would mean downloading every market to populate a dropdown. */
  try {
    const cur = await AistApi.fetchCurrencies();
    baseAssets = cur.onchain || [];
  } catch { baseAssets = AistApi.ONCHAIN.slice(); }
  renderCurrencyFilters();
  await loadPage();

  search.addEventListener('input', () => render(search.value));

  /* Load the next page as the last one comes into view. The button stays for
     keyboard users and for browsers without an observer. */
  if ('IntersectionObserver' in window) {
    const sentinel = document.getElementById('more');
    if (sentinel) {
      new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting) && cursor && !loading) loadPage();
      }, { rootMargin: '400px' }).observe(sentinel);
    }
  }
})();
