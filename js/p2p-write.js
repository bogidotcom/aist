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
    const auth = await global.AistPairing.requestSignature(action, fields, human);
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
   * Take an order. Creates the trade and locks escrow on the node.
   * On a sell order the taker needs no balance — the maker's base is already
   * escrowed, and the taker pays off-chain.
   */
  function selectOrder({ orderId, daiAmount, quoteAmount, order }) {
    return signedPost(
      `/api/p2p/orders/${encodeURIComponent(orderId)}/select`,
      'select-order',
      { orderId, daiAmount, quoteAmount },
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
    selectOrder, markPaymentSent, releaseTrade, cancelTrade, disputeTrade,
    stateLabel, nextAction, STATE_KEYS,
  };
})(window);
