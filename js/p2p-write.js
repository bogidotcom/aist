/* P2P write path.
 *
 * Every mutating call is authenticated by an ed25519 signature the browser
 * cannot produce — it asks the paired signer, which shows the user what they
 * are approving. See js/pairing.js.
 *
 * The signed payload shape is fixed by the node's verifyP2PAuth:
 *
 *   JSON.stringify({ address, timestamp, action, ...actionFields })
 *
 * Key ORDER matters — the node rebuilds the same object and re-serialises it,
 * so `address` must come first and `timestamp` second. The signer builds this
 * itself; this file only names the action and its fields.
 */
(function (global) {
  const A = () => global.AistApi;

  /* Which signer is holding the key.
     The paired DAI Wallet if a session is live, otherwise the identity this
     browser generated for itself (js/identity.js). Both expose the same
     requestSignature, so nothing below has to know the difference — but they
     are not equally safe, and the UI says so: a paired app shows the user what
     they are approving on a second device, a local key just signs. */
  function signer() {
    const paired = global.AistPairing;
    if (paired && paired.isLive()) return paired;
    return global.AistIdentity;
  }

  function signerStatus() {
    const paired = global.AistPairing;
    if (paired && paired.isLive()) return { kind: 'paired', ...paired.status() };
    const local = global.AistIdentity && global.AistIdentity.status();
    if (local && local.address) return { kind: 'local', ...local };
    return { kind: 'none', address: null };
  }

  function canSign() {
    const paired = global.AistPairing;
    if (paired && paired.isLive()) return true;
    return !!(global.AistIdentity && global.AistIdentity.isLive());
  }

  async function post(path, body) {
    const res = await fetch(A().apiBase().replace(/\/$/, '') + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let json;
    try { json = await res.json(); } catch { json = {}; }
    if (!res.ok || json.error) {
      const err = new Error(json.error || `request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return json;
  }

  /**
   * Ask the signer to authorise `action`, then send it to the node.
   * `human` is what the signer shows the person approving — it must describe
   * the real consequence, not the wire format.
   */
  async function signedPost(path, action, fields, human) {
    const auth = await signer().requestSignature(action, fields, human);
    return post(path, { ...auth, ...fields });
  }

  /* ── reads (authoritative trade state) ───────────────────────────────── */

  async function getTrade(tradeId) {
    const res = await fetch(A().apiBase().replace(/\/$/, '') + '/api/p2p/trades/' + encodeURIComponent(tradeId));
    if (!res.ok) throw new Error('trade not found');
    return res.json();
  }

  async function myTrades(address) {
    const res = await fetch(A().apiBase().replace(/\/$/, '')
      + '/api/p2p/trades/my?address=' + encodeURIComponent(address));
    if (!res.ok) return { trades: [] };
    return res.json();
  }

  /* ── writes ──────────────────────────────────────────────────────────── */

  /**
   * Post an offer.
   *
   * "I give USDT-ERC20, I want DAI" is a BUY of DAI quoted in USDT-ERC20 —
   * a bid, not an ask. The node rejects a buy whose quote is itself on-chain
   * (those are sell-side only, so both authorisations exist when funds move),
   * but an off-chain quote like USDT is exactly this case and needs no escrow
   * from the maker at creation: the DAI seller escrows when they take it.
   *
   * Field order is load-bearing. The node rebuilds
   * { address, timestamp, action, side, baseAsset, quoteCurrency, daiAmount,
   *   pricePerDAI, paymentMethods } and re-serialises it, and JSON.stringify
   * preserves insertion order — so these keys must be listed in that order or
   * every signature fails.
   */
  function createOrder({ side, baseAsset, quoteCurrency, daiAmount, pricePerDAI, paymentMethods }) {
    const fields = {
      side,
      baseAsset: baseAsset || 'DAI',
      quoteCurrency,
      daiAmount,
      pricePerDAI,
      paymentMethods: paymentMethods || [],
    };
    const asset = A().displayOf(fields.baseAsset);
    const size = A().formatRaw(fields.baseAsset, daiAmount);
    return signedPost('/api/p2p/orders', 'create-order', fields, {
      title: side === 'sell' ? 'Post an offer to sell' : 'Post an offer to buy',
      detail: side === 'sell'
        ? `Sell ${size} ${asset} for ${quoteCurrency} at ${pricePerDAI} per ${asset}`
        : `Buy ${size} ${asset} with ${quoteCurrency} at ${pricePerDAI} per ${asset}`,
      warning: side === 'sell'
        ? 'Your ' + asset + ' is locked in escrow as soon as this is posted.'
        : null,
    });
  }

  function cancelOrder({ orderId }) {
    return signedPost(
      `/api/p2p/orders/${encodeURIComponent(orderId)}/cancel`,
      'cancel-order',
      { orderId },
      { title: 'Cancel this offer', detail: `Order ${orderId}`, orderId },
    );
  }

  /**
   * Take an order. Creates the trade and locks escrow on the node.
   * On a sell order the taker needs no balance — the maker's base is already
   * escrowed, and the taker pays off-chain.
   */
  function selectOrder({ orderId, daiAmount, quoteAmount, takerPayoutAddress, order }) {
    return signedPost(
      `/api/p2p/orders/${encodeURIComponent(orderId)}/select`,
      'select-order',
      // takerPayoutAddress is signed as of 0.4.35 — it decides where the
      // taker's funds land, so leaving it out let it be rewritten in flight.
      { orderId, daiAmount, quoteAmount, takerPayoutAddress: takerPayoutAddress || null },
      {
        title: 'Take this order',
        detail: order
          ? `Lock ${A().formatRaw(order.baseAsset || 'DAI', daiAmount)} ${A().displayOf(order.baseAsset || 'DAI')}`
            + ` against ${quoteAmount} ${order.quoteCurrency}`
          : `Order ${orderId}`,
        orderId,
      },
    );
  }

  /**
   * Tell the node the off-chain payment has been made. This is the step the old
   * localStorage button faked: it is what moves the trade to `payment_sent` and
   * lets the seller release escrow.
   */
  function markPaymentSent({ tradeId, trade, order }) {
    return signedPost(
      `/api/p2p/trades/${encodeURIComponent(tradeId)}/payment-sent`,
      'payment-sent',
      { tradeId },
      {
        title: 'Confirm you have paid',
        detail: trade && order
          ? `You sent ${trade.quoteAmount} ${order.quoteCurrency} to the seller`
          : `Trade ${tradeId}`,
        warning: 'Only confirm if the money has actually left your account.',
        tradeId,
      },
    );
  }

  /** Release escrow to the buyer. Seller-only; the node enforces this. */
  function releaseTrade({ tradeId, trade, order }) {
    return signedPost(
      `/api/p2p/trades/${encodeURIComponent(tradeId)}/release`,
      'release',
      { tradeId },
      {
        title: 'Release escrow',
        detail: trade && order
          ? `Send ${A().formatRaw(order.baseAsset || 'DAI', trade.daiAmount)} `
            + `${A().displayOf(order.baseAsset || 'DAI')} to the buyer`
          : `Trade ${tradeId}`,
        warning: 'This is final. Only release once you have received payment.',
        tradeId,
      },
    );
  }

  function cancelTrade({ tradeId }) {
    return signedPost(
      `/api/p2p/trades/${encodeURIComponent(tradeId)}/cancel`,
      'cancel',
      { tradeId },
      { title: 'Cancel this trade', detail: `Trade ${tradeId}`, tradeId },
    );
  }

  /* The reason IS signed. Node >= 0.4.25 verifies { address, timestamp, action,
     tradeId, reason } and only falls back to the older reason-less payload for
     legacy clients — in which case it DISCARDS the reason rather than recording
     text the user never signed. So omitting it here would not just leave it
     unauthenticated, it would drop it entirely.

     Field order matters: JSON.stringify is order-sensitive and the signer builds
     { address, timestamp, action, ...fields }, so `fields` must list tradeId
     before reason to match what the node reconstructs. */
  async function disputeTrade({ tradeId, reason }) {
    const auth = await global.AistPairing.requestSignature('dispute', { tradeId, reason }, {
      title: 'Open a dispute',
      detail: reason || `Trade ${tradeId}`,
      tradeId,
    });
    return post(`/api/p2p/trades/${encodeURIComponent(tradeId)}/dispute`,
      { ...auth, tradeId, reason });
  }

  /* ── trade state ─────────────────────────────────────────────────────── */

  // The node is the only authority on where a trade is. Never infer a
  // transition locally — that is what the old markSent() did wrong.
  const STATE_KEYS = {
    selected: 'tr.selected',
    payment_sent: 'tr.paymentSent',
    completed: 'tr.completed',
    cancelled: 'tr.cancelled',
    disputed: 'tr.disputed',
    expired: 'tr.expired',
  };

  function stateLabel(status) {
    const key = STATE_KEYS[status];
    return key ? global.AistUI.t(key) : status || '—';
  }

  /** Which action this viewer can take next, given their role. */
  function nextAction(trade, order, viewer) {
    if (!trade || !order || !viewer) return null;
    const isTaker = trade.taker === viewer;
    const isMaker = order.maker === viewer;
    if (!isTaker && !isMaker) return null;
    const sell = order.side === 'sell';
    const payer = sell ? trade.taker : order.maker;
    const releaser = sell ? order.maker : trade.taker;

    if (trade.status === 'selected' && payer === viewer) return 'payment-sent';
    if (trade.status === 'payment_sent' && releaser === viewer) return 'release';
    if ((trade.status === 'selected' || trade.status === 'payment_sent')) return 'dispute';
    return null;
  }

  global.AistP2P = {
    getTrade, myTrades,
    createOrder, cancelOrder,
    selectOrder, markPaymentSent, releaseTrade, cancelTrade, disputeTrade,
    stateLabel, nextAction, STATE_KEYS,
    signer, signerStatus, canSign,
  };
})(window);
