/* Public P2P reads — only endpoints in P2P-API-FOR-AIST.md */
(function (global) {
  const ONCHAIN = ['DAI', 'aiGEL', 'KGST', 'aiETB', 'aiBTN'];
  const OFFCHAIN = [
    'USDT-ERC20', 'USDT-TRC20', 'USDT-TON', 'USDT-SOL', 'USDT-BEP20',
    'USDC-ERC20', 'BTC', 'ETH', 'SOL', 'Bank Transfer',
  ];
  const ALL_QUOTES = ONCHAIN.concat(OFFCHAIN);
  const LEGACY_TO_CANON = { aiKGS: 'KGST', αιKGS: 'KGST', POH: 'DAI' };
  const DROPPED = { aiAMD: 1, αιAMD: 1, AMD: 1 };
  let _legacyKgs = false;

  function normalizeTicker(t) {
    if (t == null || t === '') return t;
    if (DROPPED[t]) return null;
    return LEGACY_TO_CANON[t] || t;
  }

  function wireTicker(t) {
    if (_legacyKgs && t === 'KGST') return 'aiKGS';
    return t;
  }

  function wirePair(pairStr) {
    if (!_legacyKgs || !pairStr) return pairStr;
    return String(pairStr).replace(/(^|-)KGST(?=-|$)/g, '$1aiKGS');
  }

  function canonList(arr) {
    const out = [];
    const seen = new Set();
    for (const raw of arr || []) {
      const t = normalizeTicker(raw);
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
    return out;
  }

  function canonMarket(m) {
    if (!m) return null;
    const base = normalizeTicker(m.base);
    const quote = normalizeTicker(m.quote);
    if (!base || !quote || base === quote) return null;
    return Object.assign({}, m, { base, quote, pair: base + '-' + quote });
  }

  function dedupeMarkets(list) {
    const seen = new Set();
    const out = [];
    for (const m of list) {
      if (seen.has(m.pair)) continue;
      seen.add(m.pair);
      out.push(m);
    }
    return out;
  }

  function canonOrder(o) {
    if (!o) return o;
    const next = Object.assign({}, o);
    if (next.baseAsset) {
      const b = normalizeTicker(next.baseAsset);
      if (b) next.baseAsset = b;
    }
    if (next.quoteCurrency) {
      const q = normalizeTicker(next.quoteCurrency);
      if (q) next.quoteCurrency = q;
    }
    if (next.daiAmount == null && next.pohAmount != null) next.daiAmount = next.pohAmount;
    if (next.pricePerDAI == null && next.pricePerPOH != null) next.pricePerDAI = next.pricePerPOH;
    return next;
  }

  const LOCAL_API = 'http://127.0.0.1:3456';
  const PUBLIC_API = 'https://miner.iamai.kg';
  const DEFAULT_API = (typeof location !== 'undefined' && /localhost|127\.0\.0\.1/.test(location.hostname))
    ? LOCAL_API
    : PUBLIC_API;
  let _resolved = '';

  function apiBase() {
    const q = new URLSearchParams(location.search).get('api');
    if (q) {
      try { localStorage.setItem('aist_api', q.replace(/\/$/, '')); } catch {}
    }
    try {
      let saved = localStorage.getItem('aist_api');
      if (saved) {
        saved = saved.replace(/\/$/, '').replace(/poh\.ge/gi, 'iamai.kg');
        return saved;
      }
    } catch {}
    return _resolved || DEFAULT_API;
  }

  async function resolveApi() {
    if (_resolved) return _resolved;
    try {
      let saved = localStorage.getItem('aist_api');
      if (saved) {
        saved = saved.replace(/\/$/, '').replace(/poh\.ge/gi, 'iamai.kg');
        _resolved = saved;
        return _resolved;
      }
    } catch {}
    if (typeof location !== 'undefined' && /localhost|127\.0\.0\.1/.test(location.hostname)) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 1200);
        const res = await fetch(LOCAL_API + '/api/p2p/currencies', { signal: ctrl.signal });
        clearTimeout(t);
        if (res.ok) { _resolved = LOCAL_API; return _resolved; }
      } catch { /* public fallback */ }
      _resolved = PUBLIC_API;
      return _resolved;
    }
    _resolved = PUBLIC_API;
    return _resolved;
  }

  function setApiBase(url) {
    localStorage.setItem('aist_api', String(url || '').replace(/\/$/, ''));
  }

  async function getJSON(path) {
    await resolveApi();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch(apiBase() + path, { signal: ctrl.signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error || res.statusText || String(res.status));
        err.status = res.status;
        err.body = data;
        throw err;
      }
      return data;
    } finally {
      clearTimeout(t);
    }
  }

  function parsePair(s) {
    if (!s) return null;
    const raw = String(s).trim();
    const quotes = ALL_QUOTES.concat(['aiKGS', 'POH']).sort((a, b) => b.length - a.length);
    for (const q of quotes) {
      const suf = '-' + q;
      if (raw.endsWith(suf)) {
        const base = normalizeTicker(raw.slice(0, -suf.length));
        const quote = normalizeTicker(q);
        if (base && quote) return { pair: base + '-' + quote, base, quote };
      }
    }
    return null;
  }

  function pairId(base, quote) { return base + '-' + quote; }

  function decimals(ticker) {
    if (ticker === 'DAI') return 9;
    if (ONCHAIN.includes(ticker)) return 2;
    if (ticker === 'ETH') return 18;
    if (ticker === 'SOL') return 9;
    if (ticker === 'BTC') return 8;
    if (/^USDT|^USDC/.test(ticker)) return 6;
    return 6;
  }

  function displayOf(ticker) {
    const t = normalizeTicker(ticker) || ticker;
    if (t === 'aiGEL') return 'αιGEL';
    if (t === 'aiETB') return 'αιETB';
    if (t === 'aiBTN') return 'αιBTN';
    if (t === 'KGST') return 'KGST';
    return t;
  }

  function family(ticker) {
    if (['USDT-ERC20', 'USDT-BEP20', 'USDC-ERC20', 'ETH'].includes(ticker)) return 'evm';
    if (ticker === 'USDT-TRC20') return 'tron';
    if (ticker === 'USDT-SOL' || ticker === 'SOL') return 'sol';
    if (ticker === 'USDT-TON') return 'ton';
    if (ticker === 'BTC') return 'btc';
    if (ticker === 'Bank Transfer') return 'bank';
    if (ONCHAIN.includes(ticker)) return 'dai';
    return 'other';
  }

  function evmChainId(ticker) {
    if (ticker === 'USDT-BEP20') return '0x38';
    return '0x1';
  }

  function tokenContract(ticker) {
    return {
      'USDT-ERC20': { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
      'USDC-ERC20': { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
      'USDT-BEP20': { address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
      'USDT-TRC20': { address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', decimals: 6 },
    }[ticker] || null;
  }

  function formatRaw(ticker, raw) {
    const d = decimals(ticker);
    const n = Number(raw || 0) / 10 ** d;
    if (!Number.isFinite(n)) return '—';
    const max = d === 2 ? 2 : n >= 1 ? 4 : 6;
    return n.toLocaleString(undefined, { maximumFractionDigits: max });
  }

  function formatPrice(v) {
    if (v == null || v === '') return '—';
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    if (n >= 100) return n.toFixed(2);
    if (n >= 1) return n.toFixed(4);
    return n.toPrecision(4);
  }

  function orderBase(order) { return normalizeTicker(order.baseAsset) || order.baseAsset || 'DAI'; }

  function orderSizeDisplay(order) {
    return formatRaw(orderBase(order), order.daiAmount);
  }

  function orderPrice(order) {
    return order.pricePerDAI;
  }

  function noteLegacy(list) {
    if ((list || []).includes('aiKGS')) _legacyKgs = true;
  }

  async function fetchCurrencies() {
    const cur = await getJSON('/api/p2p/currencies');
    noteLegacy(cur.onchain || cur.baseAssets);
    return {
      currencies: cur.currencies || OFFCHAIN,
      quote: cur.quote || cur.currencies || OFFCHAIN,
      onchain: canonList(cur.onchain || cur.baseAssets || ONCHAIN),
      baseAssets: canonList(cur.baseAssets || cur.onchain || ONCHAIN),
    };
  }

  async function fetchMarkets(pair) {
    const want = pair ? (parsePair(pair) || { pair }) : null;
    const qCanon = want ? '?pair=' + encodeURIComponent(want.pair) : '';
    const qWire = want ? '?pair=' + encodeURIComponent(wirePair(want.pair)) : '';
    try {
      const data = await getJSON('/api/p2p/markets' + qWire);
      return { markets: dedupeMarkets((data.markets || []).map(canonMarket).filter(Boolean)), synthesized: false };
    } catch (e) {
      if (e.status === 400 && qWire !== qCanon) {
        try {
          const data = await getJSON('/api/p2p/markets' + qCanon);
          return { markets: dedupeMarkets((data.markets || []).map(canonMarket).filter(Boolean)), synthesized: false };
        } catch { /* fall through */ }
      }
      if (e.status !== 404 && e.status !== 400) throw e;
      return synthesizeMarkets();
    }
  }

  async function synthesizeMarkets() {
    let cur;
    try { cur = await fetchCurrencies(); } catch { cur = { onchain: ONCHAIN, quote: OFFCHAIN }; }
    const bases = (cur.onchain || ONCHAIN).slice();
    const quotes = (cur.quote || OFFCHAIN).concat(bases);
    const seen = new Set();
    const markets = [];
    for (const rawBase of bases) {
      for (const rawQuote of quotes) {
        const m = canonMarket({
          base: rawBase, quote: rawQuote,
          last: null, change24h: null, bestBid: null, bestAsk: null,
          source: 'none',
          onchainQuote: ONCHAIN.includes(normalizeTicker(rawQuote) || rawQuote),
        });
        if (!m || seen.has(m.pair)) continue;
        seen.add(m.pair);
        markets.push(m);
      }
    }
    return { markets, synthesized: true };
  }

  async function fetchOrders(pair) {
    const p = parsePair(pair);
    const id = p ? p.pair : pair;
    try {
      const data = await getJSON('/api/p2p/orders?pair=' + encodeURIComponent(wirePair(id)));
      return { orders: (data.orders || []).map(canonOrder) };
    } catch (e) {
      if (wirePair(id) === id) throw e;
      const data = await getJSON('/api/p2p/orders?pair=' + encodeURIComponent(id));
      return { orders: (data.orders || []).map(canonOrder) };
    }
  }

  async function fetchOrder(id) {
    return getJSON('/api/p2p/orders/' + encodeURIComponent(id));
  }

  async function fetchCandles(pair, interval = '1h', limit = 200) {
    const p = parsePair(pair);
    const id = p ? p.pair : pair;
    const q = '?pair=' + encodeURIComponent(wirePair(id))
      + '&interval=' + encodeURIComponent(interval)
      + '&limit=' + encodeURIComponent(limit);
    try {
      const data = await getJSON('/api/p2p/candles' + q);
      if (data.pair) {
        const canon = parsePair(data.pair);
        if (canon) data.pair = canon.pair;
      }
      data.candles = Array.isArray(data.candles) ? data.candles : [];
      return data;
    } catch (e) {
      if (e.status === 404) return { pair: id, interval, source: 'none', candles: [] };
      throw e;
    }
  }

  global.AistApi = {
    ONCHAIN, OFFCHAIN, ALL_QUOTES, DEFAULT_API,
    apiBase, setApiBase, resolveApi, getJSON, parsePair, pairId,
    normalizeTicker, decimals, displayOf, family, evmChainId, tokenContract,
    formatRaw, formatPrice, orderBase, orderSizeDisplay, orderPrice,
    fetchCurrencies, fetchMarkets, fetchOrders, fetchOrder, fetchCandles,
  };
})(window);
