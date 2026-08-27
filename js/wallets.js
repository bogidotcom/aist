/* Injected wallets: EVM, Tron, Solana, TON, Bitcoin. Send when we can; else copy.

   EVM goes through EIP-6963. With more than one extension installed they all
   race to own window.ethereum, and the winner is often a shim that cannot
   actually connect — that is what "MetaMask extension not found" means when
   MetaMask is installed and working. EIP-6963 lets every wallet announce
   itself separately so we can hold a handle on the one the user picked. */
(function (global) {
  const state = { evm: null, tron: null, sol: null, ton: null, btc: null };
  const chosen = { evm: null };            // the announced provider in use
  const announced = new Map();             // rdns -> { info, provider }

  global.addEventListener('eip6963:announceProvider', (e) => {
    const d = e && e.detail;
    if (d && d.info && d.info.rdns && d.provider) announced.set(d.info.rdns, d);
  });
  function requestAnnouncements() {
    try { global.dispatchEvent(new Event('eip6963:requestProvider')); } catch { /* older browser */ }
  }
  requestAnnouncements();

  // Extensions inject late, so give them a moment before we read the list.
  function refresh(ms) {
    requestAnnouncements();
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
    ['okx', 'OKX', () => global.okxwallet && global.okxwallet.bitcoin],
    ['xfi', 'XDEFI', () => global.xfi && global.xfi.bitcoin],
    ['bitget', 'Bitget', () => global.bitget && global.bitget.bitcoin],
  ];
  const TRON_WALLETS = [
    ['tronlink', 'TronLink', () => global.tronLink || global.tronWeb],
  ];
  const TON_WALLETS = [
    ['tonkeeper', 'Tonkeeper', () => global.tonkeeper],
    ['ton', 'TON wallet', () => global.ton],
  ];

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
    if (family === 'sol') return probe(SOL_WALLETS);
    if (family === 'btc') return probe(BTC_WALLETS);
    if (family === 'tron') return probe(TRON_WALLETS);
    if (family === 'ton') return probe(TON_WALLETS);
    return [];
  }

  function available(family) {
    return discovered(family).length > 0;
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
      if (window.tronLink?.request) {
        await window.tronLink.request({ method: 'tron_requestAccounts' });
      }
      const tw = window.tronWeb || window.tronLink?.tronWeb;
      if (!tw?.defaultAddress?.base58) throw new Error('no-provider');
      state.tron = tw.defaultAddress.base58;
      return state.tron;
    }
    if (family === 'sol') {
      const w = pick('sol', id);
      if (!w) throw new Error('no-provider');
      const res = await withTimeout(w.provider.connect(), 45000, w.name);
      const key = (res && res.publicKey) || w.provider.publicKey;
      if (!key) throw new Error('no-accounts');
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
          state.btc = accounts[0];
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

  function disconnect(family) { state[family] = null; }

  function toRaw(ticker, displayAmt) {
    const d = AistApi.decimals(ticker);
    const n = Number(String(displayAmt).replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) throw new Error('bad-amount');
    return BigInt(Math.round(n * 10 ** d));
  }

  function pad64(hex) {
    return hex.replace(/^0x/i, '').toLowerCase().padStart(64, '0');
  }

  function encodeErc20Transfer(to, raw) {
    return '0xa9059cbb' + pad64(to) + pad64(raw.toString(16));
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
    const raw = toRaw(ticker, displayAmt);
    if (family === 'evm') {
      if (!evmProvider()) throw new Error('no-provider');
      const from = state.evm || (await connect('evm'));
      const chainId = AistApi.evmChainId(ticker);
      await ensureChain(chainId);
      const token = AistApi.tokenContract(ticker);
      if (ticker === 'ETH' || !token) {
        const hex = '0x' + raw.toString(16);
        return evmProvider().request({
          method: 'eth_sendTransaction',
          params: [{ from, to, value: hex }],
        });
      }
      return evmProvider().request({
        method: 'eth_sendTransaction',
        params: [{ from, to: token.address, data: encodeErc20Transfer(to, raw), value: '0x0' }],
      });
    }
    if (family === 'tron') {
      const tw = window.tronWeb || window.tronLink?.tronWeb;
      if (!tw) throw new Error('no-provider');
      if (!state.tron) await connect('tron');
      const token = AistApi.tokenContract(ticker);
      if (!token) throw new Error('no-provider');
      const c = await tw.contract().at(token.address);
      return c.transfer(to, raw.toString()).send();
    }
    if (family === 'btc') {
      const provider = (pick('btc') || {}).provider;
      if (!provider) throw new Error('no-provider');
      if (!state.btc) await connect('btc');
      if (ticker !== 'BTC') throw new Error('btc-only-native');
      const satoshis = Number(raw);
      const psbt = await provider.sendBitcoin(to, satoshis, { feeRate: 10 });
      return psbt;
    }
    throw new Error('no-provider');
  }

  function disconnectAll() { for (const k of Object.keys(state)) state[k] = null; chosen.evm = null; }

  global.AistWallets = {
    available, connect, address, disconnect, disconnectAll, send, toRaw,
    discovered, refresh,
  };
})(window);
