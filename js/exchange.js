(async function () {
  AistUI.mountChrome();

  const params = new URLSearchParams(location.search);
  let pairStr = params.get('pair') || 'KGST-USDT-TRC20';
  let parsed = AistApi.parsePair(pairStr) || AistApi.parsePair('KGST-USDT-TRC20');
  let market = null;
  let orders = [];
  let selected = null;
  let giveIsQuote = true; // taking a sell: give quote, receive base

  const els = {
    pair: document.getElementById('pair-sym'),
    last: document.getElementById('pair-last'),
    book: document.getElementById('book'),
    ticket: document.getElementById('ticket'),
    pairSelect: document.getElementById('pair-select'),
    gelt: document.getElementById('gelt-note'),
    chart: document.getElementById('chart'),
    iv: document.getElementById('iv'),
  };
  let interval = '1h';

  function drawCandles(host, candles) {
    if (!host) return;
    if (!candles.length) {
      host.innerHTML = `<div class="empty" data-i18n="ex.chartEmpty">${AistUI.t('ex.chartEmpty')}</div>`;
      return;
    }
    const W = 640, H = 220, padL = 52, padR = 12, padT = 14, padB = 22;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const highs = candles.map((c) => c.h);
    const lows = candles.map((c) => c.l);
    let min = Math.min.apply(null, lows);
    let max = Math.max.apply(null, highs);
    if (min === max) { min -= Math.abs(min) * 0.01 || 0.01; max += Math.abs(max) * 0.01 || 0.01; }
    const span = max - min;
    const x = (i) => padL + (i + 0.5) * (plotW / candles.length);
    const y = (p) => padT + (1 - (p - min) / span) * plotH;
    const bw = Math.max(2, Math.min(10, plotW / candles.length - 2));
    const ticks = 4;
    let grid = '';
    for (let i = 0; i <= ticks; i++) {
      const v = max - (span * i) / ticks;
      const yy = padT + (plotH * i) / ticks;
      grid += `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="#232821" />`;
      grid += `<text x="${padL - 6}" y="${yy + 3}" text-anchor="end" fill="#8d9388" font-size="10" font-family="IBM Plex Mono,monospace">${AistApi.formatPrice(v)}</text>`;
    }
    const last = candles[candles.length - 1];
    const firstT = candles[0].t, lastT = last.t;
    const fmtT = (t) => {
      const d = new Date(t);
      if (interval === '1d') return d.toISOString().slice(0, 10);
      return d.toISOString().slice(11, 16);
    };
    let bodies = '';
    candles.forEach((c, i) => {
      const up = c.c >= c.o;
      const color = up ? '#3dff8a' : '#ff6b6b';
      const cx = x(i);
      const y1 = y(c.h), y2 = y(c.l);
      const yo = y(c.o), yc = y(c.c);
      const top = Math.min(yo, yc), bot = Math.max(yo, yc);
      const bh = Math.max(1, bot - top);
      bodies += `<line x1="${cx}" y1="${y1}" x2="${cx}" y2="${y2}" stroke="${color}" stroke-width="1"/>`;
      bodies += `<rect x="${cx - bw / 2}" y="${top}" width="${bw}" height="${bh}" fill="${color}"/>`;
    });
    host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">
      ${grid}${bodies}
      <text x="${padL}" y="${H - 6}" fill="#5c6358" font-size="10" font-family="IBM Plex Mono,monospace">${fmtT(firstT)}</text>
      <text x="${W - padR}" y="${H - 6}" text-anchor="end" fill="#5c6358" font-size="10" font-family="IBM Plex Mono,monospace">${fmtT(lastT)}</text>
    </svg>`;
  }

  async function loadChart() {
    if (!els.chart) return;
    try {
      const data = await AistApi.fetchCandles(parsed.pair, interval, 200);
      drawCandles(els.chart, data.candles || []);
    } catch (e) {
      els.chart.innerHTML = `<div class="empty">${AistUI.t('err.api')} ${e.message || ''}</div>`;
    }
  }

  els.iv?.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-iv]');
    if (!b) return;
    interval = b.dataset.iv;
    els.iv.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    loadChart();
  });

  function payMethod(order) {
    const m = (order && order.paymentMethods && order.paymentMethods[0]) || null;
    return m;
  }

  function setPair(p) {
    parsed = p;
    pairStr = p.pair;
    const u = new URL(location.href);
    u.searchParams.set('pair', p.pair);
    history.replaceState(null, '', u.pathname + u.search);
    selected = null;
    load();
  }

  async function load() {
    els.pair.textContent = AistApi.displayOf(parsed.base) + ' / ' + AistApi.displayOf(parsed.quote);
    try {
      const [mk, od] = await Promise.all([
        AistApi.fetchMarkets(parsed.pair).catch(() => AistApi.fetchMarkets()),
        AistApi.fetchOrders(parsed.pair),
      ]);
      loadChart();
      const list = mk.markets || [];
      market = list.find((m) => m.pair === parsed.pair) || list[0] || null;
      if (mk.synthesized) market = market || { pair: parsed.pair, last: null };
      orders = od.orders || [];
      const lastTxt = AistApi.formatPrice(market && market.last);
      els.last.textContent = lastTxt;
      els.last.classList.toggle('empty', lastTxt === '—');
      const chgEl = document.getElementById('pair-chg');
      if (chgEl) {
        const chg = market && market.change24h;
        if (chg == null) { chgEl.textContent = ''; }
        else {
          chgEl.textContent = (chg >= 0 ? '+' : '') + (chg * 100).toFixed(2) + '%';
          chgEl.style.color = chg >= 0 ? 'var(--bid)' : 'var(--ask)';
        }
      }
      renderBook();
      renderTicket();
    } catch (e) {
      els.book.innerHTML = `<p class="err">${AistUI.t('err.api')} ${e.message || ''}</p>`;
    }
  }

  // The picker is built once, from an unfiltered /markets call. load() asks for
  // ?pair=<current>, which returns that market alone — using it here left the
  // dropdown with a single entry and nothing to search.
  async function initPairPicker() {
    let list = [];
    try {
      const all = await AistApi.fetchMarkets();
      list = all.markets || [];
    } catch { /* featured fallback below */ }
    fillPairSelect(list);
  }

  function fillPairSelect(list) {
    if (!els.pairSelect || els.pairSelect.dataset.ready) return;
    const featured = ['KGST-USDT-TRC20', 'KGST-USDT-ERC20', 'aiGEL-KGST', 'aiETB-KGST', 'aiBTN-KGST', 'DAI-USDT-TRC20'];
    const opts = [];
    const have = new Set((list || []).map((m) => m.pair));
    for (const id of featured) if (have.has(id) || !list.length) opts.push(id);
    if (!opts.length) opts.push.apply(opts, featured);
    for (const m of list || []) if (!opts.includes(m.pair)) opts.push(m.pair);
    if (!opts.includes(parsed.pair)) opts.unshift(parsed.pair);

    // Populate hidden select for compatibility
    els.pairSelect.innerHTML = opts.map((id) => {
      const p = AistApi.parsePair(id);
      const label = p ? `${AistApi.displayOf(p.base)} / ${AistApi.displayOf(p.quote)}` : id;
      return `<option value="${id}" ${id === parsed.pair ? 'selected' : ''}>${label}</option>`;
    }).join('');

    // Setup searchable dropdown
    const searchInput = document.getElementById('pair-search');
    const dropdown = document.getElementById('pair-dropdown');
    let allPairs = opts;

    function updateDropdown(query = '') {
      const filtered = query.trim() === ''
        ? allPairs
        : allPairs.filter(id => {
            const p = AistApi.parsePair(id);
            const label = p ? `${AistApi.displayOf(p.base)}/${AistApi.displayOf(p.quote)}` : id;
            return label.toLowerCase().includes(query.toLowerCase()) || id.toLowerCase().includes(query.toLowerCase());
          });

      dropdown.innerHTML = filtered.map((id) => {
        const p = AistApi.parsePair(id);
        const label = p ? `${AistApi.displayOf(p.base)} / ${AistApi.displayOf(p.quote)}` : id;
        return `<div style="padding:10px 12px;cursor:pointer;border-bottom:1px solid var(--line);transition:background 0.2s" class="pair-opt" data-pair="${id}">${label}</div>`;
      }).join('');

      dropdown.querySelectorAll('.pair-opt').forEach(el => {
        el.addEventListener('mouseenter', () => {
          el.style.background = 'var(--hover, rgba(34,197,94,0.1))';
        });
        el.addEventListener('mouseleave', () => {
          el.style.background = '';
        });
        el.addEventListener('click', () => {
          const p = AistApi.parsePair(el.dataset.pair);
          if (p) {
            searchInput.value = `${AistApi.displayOf(p.base)} / ${AistApi.displayOf(p.quote)}`;
            dropdown.style.display = 'none';
            setPair(p);
          }
        });
      });
    }

    if (searchInput) {
      searchInput.addEventListener('focus', () => {
        dropdown.style.display = 'block';
        updateDropdown(searchInput.value);
      });

      searchInput.addEventListener('input', (e) => {
        dropdown.style.display = 'block';
        updateDropdown(e.target.value);
      });

      searchInput.addEventListener('blur', () => {
        setTimeout(() => { dropdown.style.display = 'none'; }, 200);
      });

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { dropdown.style.display = 'none'; searchInput.blur(); }
        if (e.key === 'Enter') {
          const only = dropdown.querySelector('.pair-opt');
          if (only && dropdown.children.length === 1) only.click();
        }
      });

      const p = AistApi.parsePair(parsed.pair);
      if (p) {
        searchInput.value = `${AistApi.displayOf(p.base)} / ${AistApi.displayOf(p.quote)}`;
      }
    }

    els.pairSelect.dataset.ready = '1';
  }

  function renderBook() {
    const asks = orders.filter((o) => o.side === 'sell').sort((a, b) => AistApi.orderPrice(a) - AistApi.orderPrice(b));
    const bids = orders.filter((o) => o.side === 'buy').sort((a, b) => AistApi.orderPrice(b) - AistApi.orderPrice(a));
    const row = (o, kind) => `
      <div class="row ${selected && selected.id === o.id ? 'on' : ''}" data-id="${o.id}">
        <span class="px ${kind}">${AistApi.formatPrice(AistApi.orderPrice(o))}</span>
        <span class="sz">${AistApi.orderSizeDisplay(o)} ${AistApi.displayOf(AistApi.orderBase(o))}</span>
      </div>`;
    els.book.innerHTML = `
      <div>
        <h3 data-i18n="ex.asks">${AistUI.t('ex.asks')}</h3>
        ${asks.length ? asks.slice(0, 12).map((o) => row(o, 'ask')).join('') : `<p class="empty" data-i18n="ex.noBook">${AistUI.t('ex.noBook')}</p>`}
      </div>
      <div>
        <h3 data-i18n="ex.bids">${AistUI.t('ex.bids')}</h3>
        ${bids.length ? bids.slice(0, 12).map((o) => row(o, 'bid')).join('') : `<p class="empty" data-i18n="ex.noBook">${AistUI.t('ex.noBook')}</p>`}
      </div>`;
    els.book.querySelectorAll('.row[data-id]').forEach((el) => {
      el.addEventListener('click', () => {
        selected = orders.find((o) => o.id === el.dataset.id) || null;
        if (selected) giveIsQuote = selected.side === 'sell';
        renderBook();
        renderTicket();
      });
    });
  }

  function giveTicker() { return giveIsQuote ? parsed.quote : parsed.base; }
  function getTicker() { return giveIsQuote ? parsed.base : parsed.quote; }

  function defaultAmount() {
    if (!selected) return '';
    if (giveIsQuote) return String(selected.quoteAmount != null ? selected.quoteAmount : (selected.maxTrade || ''));
    return AistApi.formatRaw(AistApi.orderBase(selected), selected.daiAmount);
  }

  function renderTicket() {
    const give = giveTicker();
    const get = getTicker();
    const giveFam = AistApi.family(give);
    const getFam = AistApi.family(get);
    const pay = payMethod(selected);
    const canWallet = ['evm', 'tron', 'btc'].includes(giveFam);
    const connected = AistWallets.address(giveFam) || AistWallets.address(getFam);
    const recvDefault = (['evm', 'tron', 'sol', 'ton', 'btc'].includes(getFam) && AistWallets.address(getFam)) || '';

    els.ticket.innerHTML = `
      <div class="field">
        <label data-i18n="ex.youGive">${AistUI.t('ex.youGive')}</label>
        <input value="${AistApi.displayOf(give)}  ·  ${give}" disabled>
      </div>
      <div class="field">
        <label data-i18n="ex.youGet">${AistUI.t('ex.youGet')}</label>
        <input value="${AistApi.displayOf(get)}  ·  ${get}" disabled>
      </div>
      <div class="field">
        <label data-i18n="ex.amount">${AistUI.t('ex.amount')}</label>
        <input id="amt" inputmode="decimal" value="${defaultAmount()}" placeholder="0.00">
      </div>
      <div class="field">
        <label data-i18n="ex.receiveAddr">${AistUI.t('ex.receiveAddr')}</label>
        <input id="recv" value="${recvDefault}" placeholder="…">
        <p class="hint" data-i18n="ex.receiveHint">${AistUI.t('ex.receiveHint')}</p>
      </div>
      ${selected && pay && pay.address ? `
        <div class="paybox">
          <div class="hint"><span data-i18n="ex.payTo">${AistUI.t('ex.payTo')}</span>
            · <span data-i18n="ex.network">${AistUI.t('ex.network')}</span> ${pay.network || give}</div>
          <div class="addr" id="pay-addr">${pay.address}</div>
          <div class="row-btns">
            <button class="btn btn-ghost" id="copy-addr" data-i18n="ex.copy">${AistUI.t('ex.copy')}</button>
            <button class="btn btn-ghost" id="connect-btn" data-i18n="ex.connect">${AistUI.t('ex.connect')}</button>
            ${canWallet ? `<button class="btn btn-lime" id="send-btn" data-i18n="ex.send">${AistUI.t('ex.send')}</button>` : ''}
          </div>
          ${connected ? `<p class="hint">${AistUI.t('wal.connected')}: ${connected}</p>` : ''}
          <p class="hint" data-i18n="ex.manual">${AistUI.t('ex.manual')}</p>
        </div>` : `
        <p class="hint">${selected ? AistUI.t('ex.onchain') : AistUI.t('ex.pickOrder')}</p>
        ${selected ? `<p class="hint" data-i18n="ex.locked">${AistUI.t('ex.locked')}</p>` : ''}
        <button class="btn btn-ghost btn-wide" id="connect-btn" data-i18n="ex.connect">${AistUI.t('ex.connect')}</button>
      `}
      <p class="hint" id="tx-status"></p>
    `;

    document.getElementById('copy-addr')?.addEventListener('click', async (e) => {
      await AistUI.copy(pay.address);
      AistUI.toast(e.currentTarget, 'ex.copied');
    });
    document.getElementById('connect-btn')?.addEventListener('click', () => openWalletModal(giveFam === 'other' ? getFam : giveFam));
    document.getElementById('send-btn')?.addEventListener('click', () => sendPay(giveFam, give, pay && pay.address));
  }

  function openWalletModal(prefer) {
    const families = [
      { id: 'evm', key: 'wal.evm' },
      { id: 'tron', key: 'wal.tron' },
      { id: 'sol', key: 'wal.sol' },
      { id: 'ton', key: 'wal.ton' },
      { id: 'btc', key: 'wal.btc' },
    ];
    AistUI.openModal(`
      <h3 data-i18n="wal.title">${AistUI.t('wal.title')}</h3>
      ${families.map((f) => `
        <button class="opt" data-fam="${f.id}">
          <span data-i18n="${f.key}">${AistUI.t(f.key)}</span>
          <small>${AistWallets.available(f.id) ? 'ok' : '—'}</small>
        </button>`).join('')}
      <p class="hint" data-i18n="wal.none">${AistUI.t('wal.none')}</p>
    `);
    AistUI.apply(document.getElementById('sheet'));
    document.querySelectorAll('.opt[data-fam]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await AistWallets.connect(btn.dataset.fam);
          AistUI.closeModal();
          renderTicket();
        } catch (e) {
          const hint = document.querySelector('#sheet .hint');
          if (hint) {
            let msg = AistUI.t('err.noProvider');
            if (e && e.message) {
              if (e.message === 'no-provider') {
                const fam = btn.dataset.fam;
                const providers = {
                  evm: 'MetaMask, Coinbase, or another EVM wallet',
                  tron: 'TronLink or Tron Web wallet',
                  sol: 'Phantom, Solflare, or another Solana wallet',
                  ton: 'Tonkeeper or another TON wallet',
                  btc: 'Unisat, XFi, Bitget, or OKX Bitcoin wallet'
                };
                msg = `Please install ${providers[fam] || 'a wallet extension'} to continue.`;
              } else {
                msg = e.message;
              }
            }
            hint.textContent = msg;
          }
          console.error('Wallet connect failed:', e);
        }
      });
    });
    if (prefer && ['evm', 'tron', 'sol', 'ton', 'btc'].includes(prefer) && AistWallets.available(prefer)) {
      /* leave user to tap; autofocus the preferred row */
      const el = document.querySelector(`.opt[data-fam="${prefer}"]`);
      if (el) el.style.borderColor = 'var(--lime)';
    }
  }

  async function sendPay(family, ticker, to) {
    const status = document.getElementById('tx-status');
    const amt = document.getElementById('amt')?.value;
    if (!to) return;
    try {
      if (!AistWallets.address(family)) await AistWallets.connect(family);
      const tx = await AistWallets.send(family, ticker, to, amt);
      status.textContent = typeof tx === 'string' ? tx : (tx && (tx.txid || tx) || 'ok');
    } catch (e) {
      status.textContent = AistUI.t('err.send') + (e && e.message && e.message !== 'no-provider' ? ' · ' + e.message : '');
    }
  }

  load();
  initPairPicker();
})();
