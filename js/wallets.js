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
    discovered, refresh, assertEvmAddress, fmtUnits, unitsFor,
  };
})(window);
