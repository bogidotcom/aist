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
      /* Markets that actually have a book, plus a capped page of the rest.
         Asking for everything used to be fine at 360 markets; the same call
         returns ~25,000 once the currency list expands, to populate a dropdown
         nobody scrolls past the first screen of. */
      const [withBook, head] = await Promise.all([
        AistApi.fetchMarkets({ hasBook: true, limit: 200 }).catch(() => ({ markets: [] })),
        AistApi.fetchMarkets({ limit: 300 }).catch(() => ({ markets: [] })),
      ]);
      const seen = new Set();
      for (const m of (withBook.markets || []).concat(head.markets || [])) {
        if (seen.has(m.pair)) continue;
        seen.add(m.pair);
        list.push(m);
      }
    } catch { /* featured fallback below */ }
    fillPairSelect(list);
  }

  function fillPairSelect(list) {
    if (!els.pairSelect || els.pairSelect.dataset.ready) return;
    // aiGEL was dropped from the chain; a pair that does not exist is skipped.
    const featured = ['KGST-USDT-TRC20', 'KGST-USDT-ERC20', 'DAI-USDT-TRC20', 'aiETB-KGST', 'aiBTN-KGST', 'aiBDT-KGST'];
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
    const paired = AistP2P.signerStatus();
    const me = paired.address || null;
    const tr = liveTrade && liveTrade.trade;
    const trOrder = liveTrade && liveTrade.order;
    const next = tr ? AistP2P.nextAction(tr, trOrder, me) : null;
    /* A DAI-network asset can never be autofilled. The connected wallet is a
       MetaMask or a Phantom — it holds a secp256k1 or ed25519 key for someone
       else's chain, and has no DAI address to offer. Only the off-chain
       families have an address worth prefilling here. */
    const recvIsDai = getFam === 'dai';
    const recvDefault = (!recvIsDai && ['evm', 'tron', 'sol', 'ton', 'btc'].includes(getFam)
      && AistWallets.address(getFam)) || '';

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
        <label>${recvIsDai
          ? AistUI.t('ex.receiveDaiAddr')
          : AistUI.t('ex.receiveAddr')}</label>
        <input id="recv" value="${recvDefault}" spellcheck="false" autocomplete="off"
               placeholder="${recvIsDai ? 'dai…' : '…'}">
        <p class="hint">${recvIsDai
          ? AistUI.t('ex.receiveDaiHint').replace('{asset}', AistApi.displayOf(get))
          : AistUI.t('ex.receiveHint')}</p>
        <p class="err" id="recv-err" hidden></p>
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
          <p class="hint" id="trade-note">${paired.address
            ? AistUI.t('ex.signingAs').replace('{a}', paired.address.slice(0, 12) + '…')
            : AistUI.t('off.willCreateIdentity')}</p>
        </div>` : `
        <p class="hint">${selected ? AistUI.t('ex.onchain') : AistUI.t('ex.pickOrder')}</p>
        ${selected ? `<p class="hint" data-i18n="ex.locked">${AistUI.t('ex.locked')}</p>` : ''}
        <button class="btn btn-ghost btn-wide" id="connect-btn" data-i18n="ex.connect">${AistUI.t('ex.connect')}</button>
      `}
      <p class="hint" id="tx-status"></p>
    `;

    /* Catch the wrong-chain paste before it costs anyone anything. Pasting a
       MetaMask 0x… here is the obvious mistake to make, and the field it is
       being pasted into decides where an asset gets sent. */
    if (recvIsDai) {
      const recvEl = document.getElementById('recv');
      const errEl = document.getElementById('recv-err');
      const checkRecv = () => {
        const v = (recvEl.value || '').trim();
        let key = '';
        if (!v) key = '';
        else if (/^0x[0-9a-fA-F]{40}$/.test(v)) key = 'err.recvEvm';
        else if (!/^dai[0-9a-f]{40}$/i.test(v)) key = 'err.recvNotDai';
        errEl.hidden = !key;
        errEl.textContent = key ? AistUI.t(key) : '';
      };
      recvEl.addEventListener('input', checkRecv);
      recvEl.addEventListener('blur', checkRecv);
    }

    document.getElementById('copy-addr')?.addEventListener('click', async (e) => {
      await AistUI.copy(pay.address);
      AistUI.toast(e.currentTarget, 'ex.copied');
    });
    renderOffer();
    document.getElementById('connect-btn')?.addEventListener('click', () => openWalletModal(giveFam === 'other' ? getFam : giveFam));
    document.getElementById('send-btn')?.addEventListener('click', () => sendPay(giveFam, give, pay && pay.address));
    const note = () => document.getElementById('trade-note');
    async function act(fn, args) {
      const el = note();
      /* Signing no longer requires the aist:// pairing flow, which is still
         commented out. If no key exists yet, AistIdentity generates one and
         registers it with the node on first use — see js/identity.js for what
         that costs in safety. */
      if (!AistP2P.canSign()) {
        if (el) el.textContent = AistUI.t('off.creatingIdentity');
        try { await AistIdentity.ensure(); }
        catch (e) { if (el) el.textContent = offerError(e); return; }
      }
      if (el) {
        el.textContent = AistP2P.signerStatus().kind === 'paired'
          ? AistUI.t('ex.approveOnSigner') : AistUI.t('off.signing');
      }
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
        // Where the taker wants their side sent. Signed as of 0.4.35.
        takerPayoutAddress: (document.getElementById('recv')?.value || '').trim() || null,
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

  /* ── make an offer ─────────────────────────────────────────────────────
     "I give USDT-ERC20, I want DAI" is a BUY of DAI quoted in USDT-ERC20.
     The node escrows only ever the on-chain leg: a sell locks the maker's base
     at creation, a buy locks the taker's base when they take it. So the maker's
     off-chain funds are never held by anyone, and the balance check below is a
     warning shown to the person posting — not a promise to whoever fills it. */

  const offer = { side: 'buy', open: false, checking: false, check: null };

  function offerQuoteAmount() {
    const amt = Number(document.getElementById('offer-amt')?.value || 0);
    const price = Number(document.getElementById('offer-price')?.value || 0);
    if (!(amt > 0) || !(price > 0)) return 0;
    return amt * price;
  }

  /* What the maker must be able to hand over if this offer is filled in full.
     A sell escrows the base on the DAI chain the moment it is posted; a buy
     pays the quote later, from a wallet on that quote's own chain. */
  function offerObligation() {
    const isSell = offer.side === 'sell';
    return isSell
      ? { ticker: parsed.base, family: 'dai', amount: Number(document.getElementById('offer-amt')?.value || 0) }
      : { ticker: parsed.quote, family: AistApi.family(parsed.quote), amount: offerQuoteAmount() };
  }

  async function checkOfferFunds() {
    const need = offerObligation();
    offer.check = null;
    if (!(need.amount > 0)) return null;

    if (need.family === 'dai') {
      const who = AistP2P.signerStatus().address;
      if (!who) return { unknown: true, reason: 'no-identity', ...need };
      try {
        const bal = await AistApi.fetchBalance(who);
        const have = BigInt(AistApi.heldRaw(bal, need.ticker));
        const raw = AistWallets.toRaw(need.ticker, String(need.amount), AistApi.decimals(need.ticker));
        return { ok: have >= raw, have, need: raw, dec: AistApi.decimals(need.ticker), ticker: need.ticker };
      } catch (e) {
        return { unknown: true, reason: (e && e.message) || 'lookup-failed', ...need };
      }
    }
    if (need.family === 'bank' || need.family === 'other') {
      // Nothing to read — a bank transfer has no chain to ask.
      return { unknown: true, reason: 'offchain-rail', ...need };
    }
    if (!AistWallets.address(need.family)) {
      return { unknown: true, reason: 'not-connected', family: need.family, ...need };
    }
    return AistWallets.hasBalance(need.family, need.ticker, String(need.amount));
  }

  function fundsLine(check) {
    if (!check) return '';
    const esc = (v) => String(v).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    if (check.unknown) {
      const key = {
        'not-connected': 'off.needWallet',
        'offchain-rail': 'off.noCheck',
        'no-identity': 'off.needIdentity',
      }[check.reason] || 'off.checkFailed';
      return `<p class="hint">${esc(AistUI.t(key))}</p>`;
    }
    const have = AistWallets.fmtUnits(check.have, check.dec);
    if (check.ok) {
      return `<p class="hint ok">${esc(AistUI.t('off.funded').replace('{have}', have)
        .replace('{t}', AistApi.displayOf(check.ticker)))}</p>`;
    }
    return `<p class="err">${esc(AistUI.t('off.short').replace('{have}', have)
      .replace('{t}', AistApi.displayOf(check.ticker)))}</p>`;
  }

  function renderOffer() {
    const host = document.getElementById('offer');
    if (!host) return;
    const isSell = offer.side === 'sell';
    const give = isSell ? parsed.base : parsed.quote;
    const get = isSell ? parsed.quote : parsed.base;
    const signerSt = AistP2P.signerStatus();

    if (!offer.open) {
      host.innerHTML = `<button class="btn btn-ghost btn-wide" id="offer-open">${AistUI.t('off.make')}</button>`;
      document.getElementById('offer-open').onclick = () => { offer.open = true; renderOffer(); };
      return;
    }

    /* The node refuses a buy whose quote is itself on-chain: both sides must
       authorise at the moment funds move, which only the sell shape gives it.
       Say so here rather than letting the post fail with a 400. */
    const onchainQuote = AistApi.family(parsed.quote) === 'dai';
    const blocked = onchainQuote && !isSell;

    host.innerHTML = `
      <div class="offer-head">
        <h2>${AistUI.t('off.title')}</h2>
        <button class="btn-x" id="offer-close" aria-label="${AistUI.t('off.close')}">×</button>
      </div>
      <div class="seg" role="tablist">
        <button type="button" role="tab" class="${!isSell ? 'on' : ''}" data-side="buy"
          aria-selected="${!isSell}">${AistUI.t('off.buy').replace('{b}', AistApi.displayOf(parsed.base))}</button>
        <button type="button" role="tab" class="${isSell ? 'on' : ''}" data-side="sell"
          aria-selected="${isSell}">${AistUI.t('off.sell').replace('{b}', AistApi.displayOf(parsed.base))}</button>
      </div>
      <p class="hint">${AistUI.t('off.shape')
        .replace('{give}', AistApi.displayOf(give)).replace('{get}', AistApi.displayOf(get))}</p>
      ${blocked ? `<p class="err">${AistUI.t('off.onchainBuy')
        .replace('{q}', AistApi.displayOf(parsed.quote)).replace('{b}', AistApi.displayOf(parsed.base))}</p>` : `
      <div class="field">
        <label>${AistUI.t('off.amount').replace('{b}', AistApi.displayOf(parsed.base))}</label>
        <input id="offer-amt" inputmode="decimal" placeholder="0.00">
      </div>
      <div class="field">
        <label>${AistUI.t('off.price').replace('{b}', AistApi.displayOf(parsed.base))
          .replace('{q}', AistApi.displayOf(parsed.quote))}</label>
        <input id="offer-price" inputmode="decimal" placeholder="0.00">
      </div>
      <div class="field">
        <label>${AistUI.t('off.total').replace('{q}', AistApi.displayOf(parsed.quote))}</label>
        <input id="offer-total" disabled value="—">
      </div>
      ${isSell ? `
        <div class="field">
          <label>${AistUI.t('off.payTo').replace('{q}', AistApi.displayOf(parsed.quote))}</label>
          <input id="offer-payto" spellcheck="false" autocomplete="off"
                 value="${AistWallets.address(AistApi.family(parsed.quote)) || ''}" placeholder="…">
          <p class="hint">${AistUI.t('off.payToHint')}</p>
        </div>` : ''}
      <div id="offer-funds">${offer.checking ? `<p class="hint">${AistUI.t('off.checking')}</p>` : fundsLine(offer.check)}</div>
      <div class="row-btns">
        <button class="btn btn-ghost" id="offer-check">${AistUI.t('off.check')}</button>
        <button class="btn btn-lime" id="offer-post">${AistUI.t('off.post')}</button>
      </div>
      <p class="hint" id="offer-note">${signerSt.address
        ? AistUI.t('ex.signingAs').replace('{a}', signerSt.address.slice(0, 12) + '…')
        : AistUI.t('off.willCreateIdentity')}</p>`}`;

    document.getElementById('offer-close').onclick = () => { offer.open = false; renderOffer(); };
    host.querySelectorAll('[data-side]').forEach((b) => {
      b.onclick = () => { offer.side = b.dataset.side; offer.check = null; renderOffer(); };
    });
    if (blocked) return;

    const recalc = () => {
      const t = offerQuoteAmount();
      document.getElementById('offer-total').value = t ? String(Number(t.toFixed(8))) : '—';
      // Any edit invalidates a check that was run against the old numbers.
      if (offer.check) { offer.check = null; document.getElementById('offer-funds').innerHTML = ''; }
    };
    document.getElementById('offer-amt').addEventListener('input', recalc);
    document.getElementById('offer-price').addEventListener('input', recalc);

    document.getElementById('offer-check').onclick = async () => {
      offer.checking = true;
      document.getElementById('offer-funds').innerHTML = `<p class="hint">${AistUI.t('off.checking')}</p>`;
      offer.check = await checkOfferFunds();
      offer.checking = false;
      document.getElementById('offer-funds').innerHTML = fundsLine(offer.check);
    };

    document.getElementById('offer-post').onclick = async () => {
      const note = document.getElementById('offer-note');
      const amt = Number(document.getElementById('offer-amt').value || 0);
      const price = Number(document.getElementById('offer-price').value || 0);
      if (!(amt > 0) || !(price > 0)) { note.textContent = AistUI.t('off.needNumbers'); return; }

      const payTo = isSell ? (document.getElementById('offer-payto').value || '').trim() : '';
      if (isSell && !payTo) { note.textContent = AistUI.t('off.needPayTo'); return; }

      /* Check funds before asking anyone to sign. A short balance is a warning,
         not a block — the maker may be about to fund the account, and only they
         know that — but it must be seen and dismissed, never skipped silently. */
      if (!offer.check) {
        note.textContent = AistUI.t('off.checking');
        offer.check = await checkOfferFunds();
        document.getElementById('offer-funds').innerHTML = fundsLine(offer.check);
        if (offer.check && offer.check.ok === false) {
          note.textContent = AistUI.t('off.confirmShort');
          return;
        }
      }

      note.textContent = AistUI.t('off.posting');
      try {
        const res = await AistP2P.createOrder({
          side: offer.side,
          baseAsset: parsed.base,
          quoteCurrency: parsed.quote,
          daiAmount: Number(AistWallets.toRaw(parsed.base, String(amt), AistApi.decimals(parsed.base))),
          pricePerDAI: price,
          paymentMethods: isSell ? [{ network: parsed.quote, address: payTo }] : [{ network: parsed.quote }],
        });
        note.textContent = AistUI.t('off.posted').replace('{id}', (res.order && res.order.id || '').slice(0, 8));
        offer.open = false;
        await load();
      } catch (e) {
        note.textContent = offerError(e);
      }
    };
  }

  function offerError(e) {
    const msg = (e && e.message) || '';
    if (/insufficient/i.test(msg)) return AistUI.t('off.errEscrow') + ' ' + msg;
    if (/sell-side only/i.test(msg)) return AistUI.t('off.onchainBuy')
      .replace('{q}', AistApi.displayOf(parsed.quote)).replace('{b}', AistApi.displayOf(parsed.base));
    if (/wallet not found/i.test(msg)) return AistUI.t('off.errNoWallet');
    if (msg === 'nacl-missing') return AistUI.t('off.errNoCrypto');
    return AistUI.t('off.errPost') + ' ' + msg;
  }

  async function openWalletModal(prefer) {
    // Chain names, not wallet names — the row already says which wallet it is.
    const CHAIN = { evm: 'EVM', tron: 'Tron', sol: 'Solana', ton: 'TON', btc: 'Bitcoin' };
    const attr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const esc = (v) => String(v).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

    AistUI.openModal(`<h3>${esc(AistUI.t('wal.title'))}</h3>
      <p class="hint" id="wal-hint">…</p>`);

    // Extensions announce themselves asynchronously; give them a beat.
    await AistWallets.refresh();

    /* One row per wallet. A multi-chain wallet gets a chip per chain instead of
       a row per chain, so Phantom stops appearing twice under its own name. */
    const rows = AistWallets.groups(prefer).map((g) => {
      // A wallet-supplied icon when there is one, otherwise a monogram — never
      // a guessed brand mark. Data-URI icons are escaped, some are raw SVG.
      const icon = g.icon
        ? `<img src="${attr(g.icon)}" alt="">`
        : esc((g.name || '?').trim().charAt(0).toUpperCase());
      const chips = g.chains.map((c, i) => `<button class="wchain${i === 0 ? ' first' : ''}" type="button"
          data-fam="${attr(c.family)}" data-wallet="${attr(c.walletId)}"
          data-label="${attr(g.name)}">${esc(CHAIN[c.family] || c.family)}</button>`).join('');
      return `<div class="opt opt-group">
        <span class="wname"><span class="wicon">${icon}</span><span class="wtext">${esc(g.name)}</span></span>
        <span class="wchains">${chips}</span>
      </div>`;
    });

    const sheet = document.getElementById('sheet');
    sheet.innerHTML = `
      <h3>${esc(AistUI.t('wal.title'))}</h3>
      ${rows.join('')}
      <p class="hint" id="wal-hint">${rows.length ? esc(AistUI.t('wal.pickChain')) : esc(AistUI.t('wal.none'))}</p>`;

    // Delegated: one listener on the sheet, so a re-render can never leave a
    // row inert.
    sheet.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('.wchain[data-fam]');
      if (!btn || btn.dataset.busy) return;
      const hint = document.getElementById('wal-hint');
      const label = btn.dataset.label || '';
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
  // aist:// "Connect signer" chip — disabled.
  // AistPairUI.mountIndicator(document.getElementById('pair-indicator'));
  // AistPairing.onChange(() => renderTicket());
})();
