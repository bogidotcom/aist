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
    // The maker's method must be the same rail we are about to send on.
    const netMismatch = !!(pay && pay.network && give && pay.network !== give);
    const paired = AistPairing.status();
    const me = paired.address || null;
    const tr = liveTrade && liveTrade.trade;
    const trOrder = liveTrade && liveTrade.order;
    const next = tr ? AistP2P.nextAction(tr, trOrder, me) : null;
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
            ${canWallet && !netMismatch ? `<button class="btn btn-lime" id="send-btn" data-i18n="ex.send">${AistUI.t('ex.send')}</button>` : ''}
          </div>
          ${connected ? `<p class="hint">${AistUI.t('wal.connected')}: ${connected}</p>` : ''}
          ${netMismatch ? `<p class="err">${AistUI.t('err.netMismatch').replace('{net}', pay.network).replace('{give}', give)}</p>` : ''}
          <p class="hint" data-i18n="ex.manual">${AistUI.t('ex.manual')}</p>
          ${tr ? `
            <div class="trade-state">
              <span class="ts-dot ts-${tr.status}"></span>
              <span class="ts-label">${AistP2P.stateLabel(tr.status)}</span>
              <span class="ts-id">${tr.id.slice(0, 8)}</span>
            </div>
            <div class="row-btns" style="margin-top:10px">
              ${next === 'payment-sent' ? `<button class="btn btn-lime" id="act-paid">${AistUI.t('ex.confirmPaid')}</button>` : ''}
              ${next === 'release' ? `<button class="btn btn-lime" id="act-release">${AistUI.t('ex.release')}</button>` : ''}
              ${(tr.status === 'selected' || tr.status === 'payment_sent') ? `
                <button class="btn btn-ghost" id="act-dispute">${AistUI.t('ex.dispute')}</button>` : ''}
            </div>` : `
            <div class="row-btns" style="margin-top:8px">
              <button class="btn btn-lime" id="act-take" ${!selected ? 'disabled' : ''}>${AistUI.t('ex.takeOrder')}</button>
            </div>`}
          <p class="hint" id="trade-note">${paired.state === 'paired'
            ? AistUI.t('ex.signingAs').replace('{a}', paired.address.slice(0, 12) + '…')
            : AistUI.t('ex.needSigner')}</p>
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
    const note = () => document.getElementById('trade-note');
    async function act(fn, args) {
      const el = note();
      if (!AistPairing.isLive()) {
        const ok = await AistPairUI.connect();
        if (!ok) return;
      }
      if (el) el.textContent = AistUI.t('ex.approveOnSigner');
      try {
        const res = await fn(args);
        const id = res.trade?.id || args.tradeId;
        await refreshTrade(id);
        if (note()) note().textContent = '';
      } catch (e) {
        if (el) el.textContent = signerError(e);
      }
    }

    document.getElementById('act-take')?.addEventListener('click', () => {
      if (!selected) return;
      act(AistP2P.selectOrder, {
        orderId: selected.id,
        daiAmount: selected.daiAmount,
        quoteAmount: Number(document.getElementById('amt')?.value || selected.quoteAmount),
        order: selected,
      });
    });
    document.getElementById('act-paid')?.addEventListener('click', () =>
      act(AistP2P.markPaymentSent, { tradeId: tr.id, trade: tr, order: trOrder }));
    document.getElementById('act-release')?.addEventListener('click', () =>
      act(AistP2P.releaseTrade, { tradeId: tr.id, trade: tr, order: trOrder }));
    document.getElementById('act-dispute')?.addEventListener('click', () => {
      const reason = prompt(AistUI.t('ex.disputeReason'));
      if (reason) act(AistP2P.disputeTrade, { tradeId: tr.id, reason });
    });
  }

  async function openWalletModal(prefer) {
    // Chain names, not wallet names — the row already says which wallet it is.
    const FAMS = [
      { id: 'evm', chain: 'EVM' },
      { id: 'tron', chain: 'Tron' },
      { id: 'sol', chain: 'Solana' },
      { id: 'ton', chain: 'TON' },
      { id: 'btc', chain: 'Bitcoin' },
    ];
    const attr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const esc = (v) => String(v).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

    AistUI.openModal(`<h3>${esc(AistUI.t('wal.title'))}</h3>
      <p class="hint" id="wal-hint">…</p>`);

    // Extensions announce themselves asynchronously; give them a beat.
    await AistWallets.refresh();

    const order = prefer
      ? [prefer].concat(FAMS.map((f) => f.id).filter((x) => x !== prefer))
      : FAMS.map((f) => f.id);
    const rows = [];
    for (const famId of order) {
      const fam = FAMS.find((f) => f.id === famId);
      for (const w of AistWallets.discovered(famId)) {
        // A wallet-supplied icon when there is one, otherwise a monogram — never
        // a guessed brand mark. Data-URI icons are escaped, some are raw SVG.
        const icon = w.icon
          ? `<img src="${attr(w.icon)}" alt="">`
          : esc((w.name || '?').trim().charAt(0).toUpperCase());
        rows.push(`<button class="opt" type="button" data-fam="${attr(famId)}" data-wallet="${attr(w.id)}">
          <span class="wname"><span class="wicon">${icon}</span><span class="wtext">${esc(w.name)}</span></span>
          <small>${esc(fam.chain)}</small>
        </button>`);
      }
    }

    const sheet = document.getElementById('sheet');
    sheet.innerHTML = `
      <h3>${esc(AistUI.t('wal.title'))}</h3>
      ${rows.join('')}
      <p class="hint" id="wal-hint">${rows.length ? '' : esc(AistUI.t('wal.none'))}</p>`;

    // Delegated: one listener on the sheet, so a re-render can never leave a
    // row inert.
    sheet.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('.opt[data-fam]');
      if (!btn || btn.dataset.busy) return;
      const hint = document.getElementById('wal-hint');
      const label = (btn.querySelector('.wtext') || btn).textContent.trim();
      btn.dataset.busy = '1';
      btn.classList.add('busy');
      if (hint) hint.textContent = AistUI.t('wal.waiting').replace('{w}', label);
      try {
        await AistWallets.connect(btn.dataset.fam, btn.dataset.wallet);
        AistUI.closeModal();
        renderTicket();
      } catch (e) {
        delete btn.dataset.busy;
        btn.classList.remove('busy');
        const code = (e && e.message) || '';
        let msg;
        if (e && (e.code === 4001 || /user rejected|user denied/i.test(code))) {
          msg = AistUI.t('wal.rejected').replace('{w}', label);
        } else if (code.startsWith('wallet-timeout')) {
          msg = AistUI.t('wal.timeout').replace('{w}', label);
        } else if (code === 'no-accounts') {
          msg = AistUI.t('wal.locked').replace('{w}', label);
        } else if (code === 'no-provider') {
          msg = AistUI.t('wal.gone').replace('{w}', label);
        } else {
          msg = label + ': ' + (code || 'connection failed');
        }
        if (hint) hint.textContent = msg;
        console.error('Wallet connect failed:', btn.dataset.fam, btn.dataset.wallet, e);
      }
    });
  }


  /* Trade state comes from the node and nowhere else.
     The previous version wrote an "I've sent it" flag to localStorage and told
     the user the maker had been notified. Nothing left the browser: the trade
     never transitioned, escrow never released, and a buyer could send real fiat
     against a trade the seller never saw. GET /api/p2p/trades/:id is the only
     authority here. */
  let liveTrade = null;      // { trade, order } from the node
  let tradePoll = null;

  function stopTradePoll() {
    if (tradePoll) { clearTimeout(tradePoll); tradePoll = null; }
  }

  async function refreshTrade(tradeId, { loop = true } = {}) {
    if (!tradeId) return null;
    try {
      const res = await AistP2P.getTrade(tradeId);
      liveTrade = res;
      renderTicket();
      const terminal = ['completed', 'cancelled', 'expired'].includes(res.trade?.status);
      if (loop && !terminal) {
        stopTradePoll();
        tradePoll = setTimeout(() => refreshTrade(tradeId), 5000);
      }
      return res;
    } catch { return null; }
  }

  function signerError(e) {
    const m = (e && e.message) || '';
    if (m === 'rejected') return AistUI.t('ex.signerRejected');
    if (m === 'timeout') return AistUI.t('ex.signerTimeout');
    if (m === 'revoked') return AistUI.t('ex.signerRevoked');
    if (m === 'no-session') return AistUI.t('ex.needSigner');
    if (m === 'address-mismatch') return AistUI.t('ex.signerMismatch');
    return AistUI.t('err.send') + (m ? ' · ' + m : '');
  }

  function evmError(e) {
    const raw = (e && (e.message || e.data && e.data.message)) || '';
    if (/^insufficient:/.test(raw)) {
      const [, bal, tok] = raw.split(':');
      return AistUI.t('err.insufficient').replace('{bal}', bal).replace('{t}', tok);
    }
    if (raw === 'no-gas') return AistUI.t('err.noGas');
    if (raw === 'bad-address') return AistUI.t('err.badAddress');
    if (raw === 'bad-amount') return AistUI.t('err.badAmount');
    if (/^too-many-decimals:/.test(raw)) return AistUI.t('err.tooManyDecimals').replace('{d}', raw.split(':')[1]);
    if (e && (e.code === 4001 || /user rejected|user denied/i.test(raw))) return AistUI.t('err.rejected');
    if (/invalid opcode|INVALID|execution reverted/i.test(raw)) return AistUI.t('err.reverted');
    return AistUI.t('err.send') + (raw ? ' · ' + raw : '');
  }

  async function sendPay(family, ticker, to) {
    const status = document.getElementById('tx-status');
    const amt = document.getElementById('amt')?.value;
    if (!to) return;
    const btn = document.getElementById('send-btn');
    if (btn) btn.disabled = true;
    status.textContent = AistUI.t('ex.sending');
    try {
      if (!AistWallets.address(family)) await AistWallets.connect(family);
      const tx = await AistWallets.send(family, ticker, to, amt);
      const hash = typeof tx === 'string' ? tx : (tx && (tx.txid || tx.hash)) || '';
      // An on-chain send is not a trade transition. The node only learns of it
      // when the payer signs payment-sent, which is a separate, explicit step.
      status.textContent = AistUI.t('ex.sentOk') + (hash ? ' · ' + hash : '');
      renderTicket();
    } catch (e) {
      status.textContent = evmError(e);
      console.error('send failed:', family, ticker, e);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  load();
  initPairPicker();
  AistPairUI.mountIndicator(document.getElementById('pair-indicator'));
  AistPairing.onChange(() => renderTicket());
})();
