/* Injected wallets: EVM, Tron, Solana, TON, Bitcoin. Send when we can; else copy.

   EVM goes through EIP-6963. With more than one extension installed they all
   race to own window.ethereum, and the winner is often a shim that cannot
   actually connect — that is what "MetaMask extension not found" means when
   MetaMask is installed and working. EIP-6963 lets every wallet announce
   itself separately so we can hold a handle on the one the user picked.

   Bitcoin has the same problem and the same shape of answer: WBIP-004 asks
   wallets to push { id, name, icon } onto window.btc_providers instead of
   fighting over a global. Probing window.unisat and friends by hand, as this
   file used to do alone, finds the wallet but not its name or its icon — which
   is why the Bitcoin rows were the two in the picker with no logo. */
(function (global) {
  const state = { evm: null, tron: null, sol: null, ton: null, btc: null };
  /* The wallet the user actually picked, per family. This used to track EVM
     only, so send() re-ran pick() for the other chains and took whatever came
     back first: connect with Unisat while Xverse is also installed and the
     payment left through Xverse. That is the same bug the EIP-6963 note above
     describes, just on the chains nobody had got to yet. */
  const chosen = { evm: null, tron: null, sol: null, ton: null, btc: null };
  const announced = new Map();             // rdns -> { info, provider }
  const standard = new Map();              // wallet-standard name -> wallet

  global.addEventListener('eip6963:announceProvider', (e) => {
    const d = e && e.detail;
    if (d && d.info && d.info.rdns && d.provider) announced.set(d.info.rdns, d);
  });
  function requestAnnouncements() {
    try { global.dispatchEvent(new Event('eip6963:requestProvider')); } catch { /* older browser */ }
  }
  requestAnnouncements();

  /* Wallet Standard is to Solana what EIP-6963 is to EVM, and it is the only
     way to see the Solana side of a wallet that does not claim window.solana —
     MetaMask's Solana support announces here and nowhere else. Wallets either
     answer our app-ready broadcast or push themselves at us unprompted, so we
     listen for both. */
  function registerStandard(w) {
    if (!w || !w.name || !w.features) return;
    // Only wallets that can actually connect on Solana.
    const chains = w.chains || [];
    if (!chains.some((c) => String(c).startsWith('solana:'))) return;
    if (!w.features['standard:connect']) return;
    standard.set(w.name, w);
  }
  const standardApi = {
    register(...wallets) {
      wallets.flat().forEach(registerStandard);
      return () => {};
    },
  };
  global.addEventListener('wallet-standard:register-wallet', (e) => {
    try { (e.detail || e)(standardApi); } catch { /* malformed registrant */ }
  });
  function requestStandard() {
    try {
      global.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: standardApi }));
    } catch { /* older browser */ }
  }
  requestStandard();

  // Extensions inject late, so give them a moment before we read the list.
  function refresh(ms) {
    requestAnnouncements();
    requestStandard();
    return new Promise((res) => setTimeout(res, ms == null ? 120 : ms));
  }

  const SOL_WALLETS = [
    ['phantom', 'Phantom', () => global.phantom && global.phantom.solana],
    ['solflare', 'Solflare', () => global.solflare],
    ['backpack', 'Backpack', () => global.backpack],
    ['injected', 'Injected Solana wallet', () => global.solana],
  ];
  const BTC_WALLETS = [
    ['unisat', 'Unisat', () => global.unisat],
    ['xverse', 'Xverse', () => global.XverseProviders && global.XverseProviders.BitcoinProvider],
    ['phantom', 'Phantom', () => global.phantom && global.phantom.bitcoin],
    ['okx', 'OKX', () => global.okxwallet && global.okxwallet.bitcoin],
    ['xfi', 'XDEFI', () => global.xfi && global.xfi.bitcoin],
    ['bitget', 'Bitget', () => global.bitget && global.bitget.bitcoin],
  ];
  /* Tron has no announcement standard at all — no EIP-6963, no Wallet
     Standard — so every wallet has to be named here to be found. TronLink was
     the only entry, which is why the picker showed no Tron row at all for
     anyone paying from OKX, Bitget or TokenPocket. */
  const TRON_WALLETS = [
    ['tronlink', 'TronLink', () => global.tronLink],
    ['okx', 'OKX', () => global.okxwallet && global.okxwallet.tronLink],
    ['bitget', 'Bitget', () => global.bitget && global.bitget.tronLink],
    ['tokenpocket', 'TokenPocket', () => global.tokenpocket && global.tokenpocket.tron],
    ['injected', 'Injected Tron wallet', () => global.tronWeb && { tronWeb: global.tronWeb }],
  ];
  const TON_WALLETS = [
    ['tonkeeper', 'Tonkeeper', () => global.tonkeeper],
    ['ton', 'TON wallet', () => global.ton],
  ];

  /* WBIP-004: wallets announce themselves on window.btc_providers, and the id
     is a dotted path to the provider object ("XverseProviders.BitcoinProvider").
     Resolved rather than eval'd, and only across plain object hops. */
  function atPath(path) {
    let cur = global;
    for (const part of String(path || '').split('.')) {
      if (!cur || typeof cur !== 'object' || !(part in cur)) return null;
      cur = cur[part];
    }
    return cur || null;
  }
  function btcAnnounced() {
    const list = Array.isArray(global.btc_providers) ? global.btc_providers : [];
    const out = [];
    for (const d of list) {
      if (!d || !d.id) continue;
      const provider = atPath(d.id) || (typeof d.getProvider === 'function' ? null : d.provider);
      if (!provider) continue;
      out.push({ id: d.id, name: d.name || d.id, provider, icon: normIcon(d.icon) });
    }
    return out;
  }

  /* A wallet that announces an icon on one chain is the same wallet on every
     other. Phantom ships its logo over EIP-6963 and says nothing about it on
     window.phantom.solana; OKX, Bitget and XDEFI do the same. Remembering the
     icon under the wallet's name lets the Solana and Bitcoin rows show the mark
     the wallet itself published, rather than a mark we invented. */
  /* Wallets that publish no icon anywhere. Unisat is the live example: it
     injects window.unisat and announces on neither WBIP-004 nor anything else,
     so there is no mark to read off it. Drop an SVG at the path below and it is
     picked up automatically — a real brand file, never one we drew. Until then
     the row falls back to a monogram tinted with the wallet's own colour, so it
     reads as deliberate rather than as a failed image. */
  const LOCAL_ICONS = { unisat: 'assets/wallets/unisat.svg' };
  const BRAND_TINT = {
    unisat: '#f7931a', tronlink: '#e50915', tokenpocket: '#2980fe',
    okx: '#000000', bitget: '#00f0ff', xdefi: '#335cd7', tonkeeper: '#0098ea',
  };
  function localIcon(name) { return LOCAL_ICONS[nameKey(name)] || ''; }
  function tintFor(name) { return BRAND_TINT[nameKey(name)] || ''; }

  const iconByName = new Map();
  function rememberIcon(name, icon) {
    const k = nameKey(name);
    if (k && icon && !iconByName.has(k)) iconByName.set(k, icon);
  }
  function nameKey(name) {
    return String(name || '').toLowerCase().replace(/\b(wallet|extension)\b/g, '').replace(/[^a-z0-9]/g, '');
  }
  function knownIcon(name) { return iconByName.get(nameKey(name)) || ''; }

  function probe(list) {
    const out = [];
    const seen = new Set();
    for (const [id, name, get] of list) {
      let p = null;
      try { p = get(); } catch { p = null; }
      if (!p || seen.has(p)) continue;   // same object under two globals
      seen.add(p);
      out.push({ id, name: walletName(p, name), provider: p, icon: iconOf(p) });
    }
    return out;
  }

  /* Wallets self-identify inconsistently; prefer what the provider claims so a
     generic "Injected wallet" row never shadows a wallet we can name. */
  function walletName(p, fallback) {
    if (p.isPhantom) return 'Phantom';
    if (p.isSolflare) return 'Solflare';
    if (p.isBackpack) return 'Backpack';
    if (p.isBraveWallet) return 'Brave Wallet';
    if (p.isOkxWallet || p.isOKExWallet) return 'OKX';
    return fallback;
  }
  function iconOf(p) {
    return normIcon(p && (p.icon || (p._metadata && p._metadata.icon)));
  }

  /* Some wallets hand back a raw, unencoded SVG data URI. It has to be
     percent-encoded or the browser rejects it and the row shows a broken
     image. */
  function normIcon(icon) {
    if (!icon) return '';
    const m = /^data:image\/svg\+xml,(?!base64)(.*)$/is.exec(icon);
    if (!m) return icon;
    try { return 'data:image/svg+xml,' + encodeURIComponent(decodeURIComponent(m[1])); }
    catch { return 'data:image/svg+xml,' + encodeURIComponent(m[1]); }
  }

  /* Every wallet we can actually reach for this family, each individually
     addressable so the user is never at the mercy of who won window.ethereum. */
  function discovered(family) {
    if (family === 'evm') {
      const out = [];
      for (const [rdns, d] of announced) {
        out.push({ id: rdns, name: d.info.name || rdns, icon: normIcon(d.info.icon), provider: d.provider });
      }
      if (!out.length && global.ethereum) {
        const eth = global.ethereum;
        // Some builds expose every racing provider on .providers
        const many = Array.isArray(eth.providers) ? eth.providers : [eth];
        many.forEach((p, i) => out.push({
          id: 'legacy:' + i,
          name: p.isMetaMask ? 'MetaMask' : p.isCoinbaseWallet ? 'Coinbase Wallet'
              : p.isRabby ? 'Rabby' : p.isTrust ? 'Trust' : 'Injected wallet',
          icon: '', provider: p,
        }));
      }
      return out;
    }
    if (family === 'sol') {
      const out = [];
      for (const [name, w] of standard) {
        out.push({ id: 'std:' + name, name, provider: w, icon: normIcon(w.icon), standard: true });
      }
      /* A wallet that announces properly must not also appear as a legacy row:
         window.phantom.solana and Phantom's Wallet Standard entry are one
         wallet, and listing both is the duplicate this picker just stopped
         showing. Match on name, since the objects differ by design. */
      const seenNames = new Set(Array.from(standard.keys()).map(nameKey));
      for (const w of probe(SOL_WALLETS)) {
        if (!seenNames.has(nameKey(w.name))) out.push(w);
      }
      return out;
    }
    if (family === 'btc') {
      const out = btcAnnounced();
      const seen = new Set(out.map((w) => w.provider));
      // Unisat and older builds announce nothing; keep probing for them.
      for (const w of probe(BTC_WALLETS)) if (!seen.has(w.provider)) out.push(w);
      return out;
    }
    if (family === 'tron') return probe(TRON_WALLETS);
    if (family === 'ton') return probe(TON_WALLETS);
    return [];
  }

  function available(family) {
    return discovered(family).length > 0;
  }

  /* One row per wallet, not per wallet-chain pair.
     Phantom speaks EVM and Solana, so it announced itself twice and the picker
     listed "Phantom" above "Phantom" — two rows with the same name and the same
     logo, distinguished only by a chain label on the far right. Grouping by
     wallet turns that into one Phantom offering two chains, and hands every
     chain the icon the wallet published on whichever chain carried it.

     `families` is ordered: the caller's preferred chain first, so the chain the
     trade actually needs is the one a plain click connects. */
  function groups(preferred) {
    const FAMILIES = ['evm', 'tron', 'sol', 'ton', 'btc'];
    const order = preferred && FAMILIES.includes(preferred)
      ? [preferred].concat(FAMILIES.filter((f) => f !== preferred))
      : FAMILIES;

    const found = order.map((fam) => [fam, discovered(fam)]);
    for (const [, list] of found) for (const w of list) rememberIcon(w.name, w.icon);

    const byKey = new Map();
    for (const [fam, list] of found) {
      for (const w of list) {
        const key = nameKey(w.name) || fam + ':' + w.id;
        let g = byKey.get(key);
        if (!g) {
          g = { key, name: w.name, icon: '', tint: tintFor(w.name), chains: [] };
          byKey.set(key, g);
        }
        if (!g.icon) g.icon = w.icon || knownIcon(w.name) || localIcon(w.name);
        // Same wallet, same chain, announced twice — keep the first.
        if (!g.chains.some((c) => c.family === fam)) {
          g.chains.push({ family: fam, walletId: w.id });
        }
      }
    }
    return Array.from(byKey.values());
  }

  function pick(family, id) {
    const list = discovered(family);
    if (!list.length) return null;
    return (id && list.find((w) => w.id === id)) || list[0];
  }

  function evmProvider() {
    return (chosen.evm && chosen.evm.provider) || (pick('evm') || {}).provider || global.ethereum || null;
  }

  function withTimeout(promise, ms, label) {
    let timer;
    return Promise.race([
      promise.finally(() => clearTimeout(timer)),
      new Promise((_, rej) => {
        timer = setTimeout(() => rej(new Error('wallet-timeout:' + (label || ''))), ms);
      }),
    ]);
  }

  async function connect(family, id) {
    if (family === 'evm') {
      const w = pick('evm', id);
      if (!w) throw new Error('no-provider');
      const acc = await withTimeout(w.provider.request({ method: 'eth_requestAccounts' }), 45000, w.name);
      if (!acc || !acc.length) throw new Error('no-accounts');
      chosen.evm = w;
      state.evm = acc[0];
      return state.evm;
    }
    if (family === 'tron') {
      const w = pick('tron', id);
      if (!w) throw new Error('no-provider');
      const link = w.provider;
      if (link.request) {
        await withTimeout(link.request({ method: 'tron_requestAccounts' }), 45000, w.name);
      }
      /* TronLink populates tronWeb on its own object once approved; the
         multi-chain wallets hang theirs off the same handle. Falling straight
         through to the global would read whichever extension won the race. */
      const tw = link.tronWeb || (link === global.tronWeb ? link : null) || global.tronWeb;
      if (!tw?.defaultAddress?.base58) throw new Error('no-accounts');
      chosen.tron = Object.assign({}, w, { tronWeb: tw });
      state.tron = tw.defaultAddress.base58;
      return state.tron;
    }
    if (family === 'sol') {
      const w = pick('sol', id);
      if (!w) throw new Error('no-provider');
      if (w.standard) {
        const feat = w.provider.features['standard:connect'];
        const res = await withTimeout(feat.connect(), 45000, w.name);
        const acc = (res && res.accounts && res.accounts[0]) || (w.provider.accounts || [])[0];
        if (!acc || !acc.address) throw new Error('no-accounts');
        chosen.sol = w;
        state.sol = acc.address;
        return state.sol;
      }
      const res = await withTimeout(w.provider.connect(), 45000, w.name);
      const key = (res && res.publicKey) || w.provider.publicKey;
      if (!key) throw new Error('no-accounts');
      chosen.sol = w;
      state.sol = key.toString();
      return state.sol;
    }
    if (family === 'ton') {
      const t = window.ton || window.tonkeeper;
      if (!t) throw new Error('no-provider');
      try {
        if (t.connect) await t.connect();
        if (t.getWallets) {
          const wallets = await t.getWallets();
          if (wallets.length > 0) {
            state.ton = wallets[0].address;
            return state.ton;
          }
        }
        if (t.account?.address) {
          state.ton = t.account.address;
          return state.ton;
        }
        throw new Error('wallet-not-connected');
      } catch (e) {
        if (e.message === 'wallet-not-connected') throw e;
        throw new Error('ton-init-failed: ' + e.message);
      }
    }
    if (family === 'btc') {
      const w = pick('btc', id);
      if (!w) throw new Error('no-provider');
      const provider = w.provider;
      try {
        const accounts = await withTimeout(provider.requestAccounts
          ? provider.requestAccounts()
          : provider.connect().then((r) => [r && r.address].filter(Boolean)), 45000, w.name);
        if (accounts && accounts.length > 0) {
          chosen.btc = w;
          state.btc = typeof accounts[0] === 'string' ? accounts[0] : accounts[0].address;
          return state.btc;
        }
        throw new Error('no-accounts');
      } catch (e) {
        throw new Error('btc-connect-failed: ' + (e.message || 'Unknown error'));
      }
    }
    throw new Error('no-provider');
  }

  function address(family) { return state[family] || null; }

  function disconnect(family) { state[family] = null; chosen[family] = null; }

  /* Exact decimal -> integer conversion. The old version did
     Math.round(n * 10 ** d), which silently loses precision at 18 decimals and
     so produced the wrong amount for BEP20 USDT. */
  function toRaw(ticker, displayAmt, dec) {
    const d = dec != null ? dec : AistApi.decimals(ticker);
    const str = String(displayAmt == null ? '' : displayAmt).trim().replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(str)) throw new Error('bad-amount');
    const [whole, frac = ''] = str.split('.');
    if (frac.length > d) throw new Error('too-many-decimals:' + d);
    const raw = BigInt(whole + frac.padEnd(d, '0'));
    if (raw <= 0n) throw new Error('bad-amount');
    return raw;
  }

  /* The token's own decimals, not the display ones. tokenContract() and
     decimals() disagree for USDT-BEP20 (18 vs 6). */
  function unitsFor(ticker) {
    const t = AistApi.tokenContract(ticker);
    return t && t.decimals != null ? t.decimals : AistApi.decimals(ticker);
  }

  const EVM_ADDR = /^0x[0-9a-fA-F]{40}$/;
  function assertEvmAddress(a) {
    if (!EVM_ADDR.test(String(a == null ? '' : a).trim())) throw new Error('bad-address');
  }

  /* Left-padding an arbitrary string to 64 chars turns a Tron or BTC address
     into a well-formed but WRONG EVM address, which would have sent funds into
     the void. Both halves are validated now. */
  function word(hex) {
    const h = String(hex).replace(/^0x/i, '').toLowerCase();
    if (!/^[0-9a-f]*$/.test(h) || h.length > 64) throw new Error('bad-encoding');
    return h.padStart(64, '0');
  }

  function encodeErc20Transfer(to, raw) {
    assertEvmAddress(to);
    return '0xa9059cbb' + word(to) + word(raw.toString(16));
  }

  async function evmBalances(provider, from, token) {
    const out = {};
    out.native = BigInt(await provider.request({ method: 'eth_getBalance', params: [from, 'latest'] }));
    if (token) {
      const r = await provider.request({
        method: 'eth_call',
        params: [{ to: token.address, data: '0x70a08231' + word(from) }, 'latest'],
      });
      out.token = BigInt(r && r !== '0x' ? r : '0x0');
    }
    return out;
  }

  /* ── balances ──────────────────────────────────────────────────────────
     What "does the maker actually hold this?" can and cannot mean.

     It CAN be answered for the chain the wallet is on: EVM over the wallet's
     own RPC, Tron over TronWeb, Solana and Bitcoin over a public read endpoint
     because their wallets expose no balance call. It CANNOT be answered by the
     DAI node, which has no view of Ethereum — so a balance is a pre-flight
     check on the maker's own machine at the moment they post, and nothing
     stops them spending it a second later. It belongs in the UI as a warning,
     never as a guarantee anyone else can rely on. Escrow is the guarantee, and
     escrow only ever holds the DAI leg. */

  const SOL_RPC = 'https://api.mainnet-beta.solana.com';
  const BTC_API = 'https://blockstream.info/api';

  async function jsonRpc(url, method, params) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const j = await res.json();
    if (j.error) throw new Error(j.error.message || 'rpc-error');
    return j.result;
  }

  async function solBalance(address, ticker) {
    if (ticker === 'SOL') {
      const r = await jsonRpc(SOL_RPC, 'getBalance', [address]);
      return BigInt((r && r.value) || 0);
    }
    const token = AistApi.tokenContract(ticker);
    if (!token) throw new Error('no-token');
    /* Sum the owner's accounts for this mint rather than deriving the
       associated address — deriving it needs off-curve point math the browser
       has no primitive for, and an owner can legitimately hold the mint in
       more than one account. */
    const r = await jsonRpc(SOL_RPC, 'getTokenAccountsByOwner',
      [address, { mint: token.address }, { encoding: 'jsonParsed' }]);
    let total = 0n;
    for (const acc of (r && r.value) || []) {
      const amt = acc?.account?.data?.parsed?.info?.tokenAmount?.amount;
      if (amt) total += BigInt(amt);
    }
    return total;
  }

  async function btcBalance(address) {
    const res = await fetch(BTC_API + '/address/' + encodeURIComponent(address));
    if (!res.ok) throw new Error('btc-lookup-failed');
    const j = await res.json();
    const c = j.chain_stats || {};
    const m = j.mempool_stats || {};
    // Confirmed spendable, minus anything already on its way out.
    return BigInt(c.funded_txo_sum || 0) - BigInt(c.spent_txo_sum || 0)
         + BigInt(m.funded_txo_sum || 0) - BigInt(m.spent_txo_sum || 0);
  }

  async function tronBalance(address, ticker) {
    const tw = (chosen.tron && chosen.tron.tronWeb) || global.tronWeb;
    if (!tw) throw new Error('no-provider');
    const token = AistApi.tokenContract(ticker);
    if (!token) return BigInt(await tw.trx.getBalance(address));
    const c = await tw.contract().at(token.address);
    const r = await c.balanceOf(address).call();
    return BigInt(r.toString());
  }

  /**
   * Spendable balance of `ticker` on `family`, in the token's own units.
   * Throws rather than guessing — a silent 0 would read as "no funds" and a
   * silent Infinity would wave through an offer nobody can fill.
   */
  async function balanceOf(family, ticker, address) {
    const who = address || state[family];
    if (!who) throw new Error('not-connected');
    if (family === 'evm') {
      const provider = evmProvider();
      if (!provider) throw new Error('no-provider');
      const token = ticker === 'ETH' ? null : AistApi.tokenContract(ticker);
      const bal = await evmBalances(provider, who, token);
      return token ? bal.token : bal.native;
    }
    if (family === 'tron') return tronBalance(who, ticker);
    if (family === 'sol') return solBalance(who, ticker);
    if (family === 'btc') return btcBalance(who);
    throw new Error('unsupported-family');
  }

  /**
   * Does `address` hold at least `displayAmt` of `ticker`?
   * Resolves { ok, have, need, ticker } on a clean read, or { unknown: true }
   * with a reason when the chain could not be reached — an unreachable RPC
   * must not read as "insufficient funds".
   */
  async function hasBalance(family, ticker, displayAmt, address) {
    const dec = unitsFor(ticker);
    let need;
    try { need = toRaw(ticker, displayAmt, dec); }
    catch (e) { return { unknown: true, reason: e.message }; }
    try {
      const have = await balanceOf(family, ticker, address);
      return { ok: have >= need, have, need, dec, ticker };
    } catch (e) {
      return { unknown: true, reason: (e && e.message) || 'lookup-failed', need, dec, ticker };
    }
  }

  function fmtUnits(raw, d) {
    const s = raw.toString().padStart(d + 1, '0');
    const out = (s.slice(0, s.length - d) + '.' + s.slice(s.length - d)).replace(/\.?0+$/, '');
    return out || '0';
  }

  async function ensureChain(chainId) {
    try {
      await evmProvider().request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
    } catch (e) {
      if (e.code === 4902 && chainId === '0x38') {
        await evmProvider().request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: '0x38',
            chainName: 'BNB Smart Chain',
            nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
            rpcUrls: ['https://bsc-dataseed.binance.org'],
            blockExplorerUrls: ['https://bscscan.com'],
          }],
        });
      } else {
        throw e;
      }
    }
  }

  async function send(family, ticker, to, displayAmt) {
    if (family === 'evm') {
      const provider = evmProvider();
      if (!provider) throw new Error('no-provider');
      assertEvmAddress(to);
      const token = AistApi.tokenContract(ticker);
      const dec = unitsFor(ticker);
      const raw = toRaw(ticker, displayAmt, dec);
      const from = state.evm || (await connect('evm'));
      await ensureChain(AistApi.evmChainId(ticker));

      /* Check funds before asking the wallet to build anything. USDT is a
         Solidity 0.4 contract whose SafeMath uses assert(), so an
         insufficient-balance transfer reverts as "invalid opcode: INVALID" —
         which tells the user nothing at all. */
      let bal;
      try { bal = await evmBalances(provider, from, ticker === 'ETH' ? null : token); }
      catch { bal = null; }
      if (bal) {
        if (ticker === 'ETH' || !token) {
          if (bal.native < raw) {
            throw new Error('insufficient:' + fmtUnits(bal.native, 18) + ':ETH');
          }
        } else {
          if (bal.token < raw) {
            throw new Error('insufficient:' + fmtUnits(bal.token, dec) + ':' + ticker);
          }
          if (bal.native === 0n) throw new Error('no-gas');
        }
      }

      if (ticker === 'ETH' || !token) {
        return provider.request({
          method: 'eth_sendTransaction',
          params: [{ from, to, value: '0x' + raw.toString(16) }],
        });
      }
      return provider.request({
        method: 'eth_sendTransaction',
        params: [{ from, to: token.address, data: encodeErc20Transfer(to, raw), value: '0x0' }],
      });
    }
    const raw = toRaw(ticker, displayAmt);
    if (family === 'tron') {
      if (!state.tron) await connect('tron');
      const tw = (chosen.tron && chosen.tron.tronWeb) || global.tronWeb || global.tronLink?.tronWeb;
      if (!tw) throw new Error('no-provider');
      const token = AistApi.tokenContract(ticker);
      if (!token) throw new Error('no-provider');
      const c = await tw.contract().at(token.address);
      return c.transfer(to, raw.toString()).send();
    }
    if (family === 'btc') {
      if (!state.btc) await connect('btc');
      // The wallet the user connected, never "whichever we found first".
      const provider = (chosen.btc || pick('btc') || {}).provider;
      if (!provider) throw new Error('no-provider');
      if (ticker !== 'BTC') throw new Error('btc-only-native');
      const satoshis = Number(raw);
      const psbt = await provider.sendBitcoin(to, satoshis, { feeRate: 10 });
      return psbt;
    }
    throw new Error('no-provider');
  }

  function disconnectAll() {
    for (const k of Object.keys(state)) state[k] = null;
    for (const k of Object.keys(chosen)) chosen[k] = null;
  }

  global.AistWallets = {
    available, connect, address, disconnect, disconnectAll, send, toRaw,
    discovered, groups, refresh, assertEvmAddress, fmtUnits, unitsFor,
    balanceOf, hasBalance,
  };
})(window);
