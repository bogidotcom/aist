/* Injected wallets: EVM, Tron, Solana, TON, Bitcoin. Send when we can; else copy. */
(function (global) {
  const state = { evm: null, tron: null, sol: null, ton: null, btc: null };

  function available(family) {
    if (family === 'evm') return !!(window.ethereum);
    if (family === 'tron') return !!(window.tronWeb || window.tronLink);
    if (family === 'sol') return !!(window.solana || window.phantom?.solana);
    if (family === 'ton') return !!(window.ton || window.tonkeeper);
    if (family === 'btc') return !!(window.unisat || window.xfi || window.bitget || window.okx?.bitcoin);
    return false;
  }

  async function connect(family) {
    if (family === 'evm') {
      if (!window.ethereum) throw new Error('no-provider');
      const acc = await window.ethereum.request({ method: 'eth_requestAccounts' });
      state.evm = acc[0] || null;
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
      const p = window.solana || window.phantom?.solana;
      if (!p) throw new Error('no-provider');
      const res = await p.connect();
      state.sol = (res.publicKey || p.publicKey).toString();
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
      const provider = window.unisat || window.xfi?.bitcoin || window.bitget?.bitcoin || window.okx?.bitcoin;
      if (!provider) throw new Error('no-provider');
      try {
        const accounts = await provider.requestAccounts();
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
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
    } catch (e) {
      if (e.code === 4902 && chainId === '0x38') {
        await window.ethereum.request({
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
      if (!window.ethereum) throw new Error('no-provider');
      const from = state.evm || (await connect('evm'));
      const chainId = AistApi.evmChainId(ticker);
      await ensureChain(chainId);
      const token = AistApi.tokenContract(ticker);
      if (ticker === 'ETH' || !token) {
        const hex = '0x' + raw.toString(16);
        return window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [{ from, to, value: hex }],
        });
      }
      return window.ethereum.request({
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
      const provider = window.unisat || window.xfi?.bitcoin || window.bitget?.bitcoin || window.okx?.bitcoin;
      if (!provider) throw new Error('no-provider');
      if (!state.btc) await connect('btc');
      if (ticker !== 'BTC') throw new Error('btc-only-native');
      const satoshis = Number(raw);
      const psbt = await provider.sendBitcoin(to, satoshis, { feeRate: 10 });
      return psbt;
    }
    throw new Error('no-provider');
  }

  global.AistWallets = { available, connect, address, disconnect, send, toRaw };
})(window);
