/* Remote-signer pairing.
 *
 * The browser must never hold a DAI private key: the same key authorises
 * on-chain transfers and escrow release, so one XSS would be total loss.
 * Instead this file keeps a throwaway session keypair and asks a real signer
 * (the mobile wallet, or the user's own desktop node) to approve and sign each
 * action.
 *
 * The relay in the middle is untrusted. Every payload is sealed with nacl.box to
 * the session key, and the `topic` — 32 random bytes — is the only capability.
 * Both travel to the signer out of band, in a QR code or a connection link.
 *
 * Session keys live in memory ONLY. They are never written to localStorage or
 * sessionStorage, so a reload ends the session and a revoked session leaves no
 * key material behind. That is deliberate: a persisted session key would be
 * exactly the thing this design exists to avoid.
 */
(function (global) {
  const nacl = global.nacl;
  const PROTOCOL = 1;
  const HELLO_TIMEOUT_MS = 3 * 60 * 1000;   // time for the human to scan and approve
  const SIGN_TIMEOUT_MS = 2 * 60 * 1000;    // time to approve one action
  const POLL_WAIT_MS = 20000;               // under the relay's 25s ceiling

  // Everything secret about the session. Memory only.
  let session = null;
  const listeners = new Set();

  const b64 = {
    enc: (u8) => btoa(String.fromCharCode.apply(null, u8)),
    dec: (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
  };
  const utf8 = {
    enc: (s) => new TextEncoder().encode(s),
    dec: (u8) => new TextDecoder().decode(u8),
  };
  const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');

  function emit() {
    const snap = status();
    for (const fn of listeners) { try { fn(snap); } catch { /* listener's problem */ } }
  }
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  function relayBase() {
    return AistApi.apiBase().replace(/\/$/, '');
  }

  /** Public, non-secret view of the session. Never exposes key material. */
  function status() {
    if (!session) return { state: 'idle' };
    return {
      state: session.state,               // 'pairing' | 'paired' | 'expired' | 'revoked'
      address: session.address || null,
      label: session.label || null,
      topic: session.topic,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      uri: session.uri,
    };
  }

  function isLive() {
    return !!session && session.state === 'paired' && Date.now() < session.expiresAt;
  }

  /* ── transport ─────────────────────────────────────────────────────────── */

  async function publish(payloadStr) {
    const res = await fetch(`${relayBase()}/api/pair/${session.topic}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'browser', payload: payloadStr }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) throw new Error(body.error || 'relay publish failed');
    return body;
  }

  /** Long-poll until a message the browser cares about arrives, or we time out. */
  async function receive(deadline, signal) {
    while (Date.now() < deadline) {
      if (signal && signal.aborted) throw new Error('cancelled');
      const wait = Math.max(0, Math.min(POLL_WAIT_MS, deadline - Date.now()));
      const url = `${relayBase()}/api/pair/${session.topic}`
        + `?since=${session.cursor}&wait=${wait}&as=browser`;
      let body;
      try {
        const res = await fetch(url, { signal });
        body = await res.json();
      } catch (e) {
        if (signal && signal.aborted) throw new Error('cancelled');
        await new Promise((r) => setTimeout(r, 1000)); // transient relay blip
        continue;
      }
      if (body.error) throw new Error(body.error);
      for (const m of body.messages || []) {
        session.cursor = Math.max(session.cursor, m.seq);
        const opened = open(m.payload);
        if (opened) return opened;
      }
    }
    throw new Error('timeout');
  }

  /* Every frame carries the sender's box public key in the clear.
     It has to: the signer's first message is sealed to us, and we cannot open it
     without knowing which key sealed it — the key cannot be inside the sealed
     body it is needed to open. Publishing it costs nothing (it is a public key)
     and the box still authenticates the sender, because only the holder of the
     matching secret could have produced a box that opens under it.

     What this does NOT defend against is someone who already knows the topic
     injecting their own hello. The topic is the capability — it travels only in
     the QR — and the paired address is shown to the user before anything is
     signed. */
  function frame(obj) {
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const box = nacl.box(utf8.enc(JSON.stringify(obj)), nonce,
      session.peerPublicKey || session.publicKey, session.secretKey);
    return JSON.stringify({ k: b64.enc(session.publicKey), n: b64.enc(nonce), b: b64.enc(box) });
  }
  const seal = frame;

  function open(payloadStr) {
    try {
      const { k, n, b } = JSON.parse(payloadStr);
      // Pin the peer on the first frame we can actually open, then never move.
      const peer = session.peerPublicKey || (k ? b64.dec(k) : session.publicKey);
      const opened = nacl.box.open(b64.dec(b), b64.dec(n), peer, session.secretKey);
      if (!opened) return null;                     // not for us, or tampered
      if (!session.peerPublicKey && k) session.peerPublicKey = peer;
      return JSON.parse(utf8.dec(opened));
    } catch { return null; }
  }

  /* ── lifecycle ─────────────────────────────────────────────────────────── */

  /**
   * Start a session and return the connection URI to show as a QR code and a
   * copyable link. Resolves only when the signer says hello.
   */
  function begin() {
    end('replaced');
    const kp = nacl.box.keyPair();
    const topic = hex(nacl.randomBytes(32));
    const relay = relayBase();
    session = {
      state: 'pairing',
      topic,
      relay,
      publicKey: kp.publicKey,
      secretKey: kp.secretKey,       // memory only, never persisted
      peerPublicKey: null,
      address: null,
      label: null,
      cursor: 0,
      startedAt: Date.now(),
      expiresAt: Date.now() + HELLO_TIMEOUT_MS,
      abort: new AbortController(),
    };
    session.uri = 'aist://pair?' + new URLSearchParams({
      v: String(PROTOCOL), relay, topic, k: b64.enc(kp.publicKey),
    }).toString();
    emit();
    return { uri: session.uri, topic, waitForSigner: waitForSigner() };
  }

  /** The signer's hello carries its box key and the DAI address it will sign for. */
  async function waitForSigner() {
    const mine = session;
    try {
      const deadline = mine.startedAt + HELLO_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const msg = await receive(deadline, mine.abort.signal);
        if (session !== mine) throw new Error('cancelled');
        if (msg.t !== 'hello') continue;
        if (!/^dai[0-9a-f]{40}$/.test(msg.address || '')) {
          throw new Error('signer sent a malformed hello');
        }
        // peerPublicKey was pinned by open() from the frame that carried it.
        if (msg.k) mine.peerPublicKey = b64.dec(msg.k);
        mine.address = msg.address;
        mine.label = msg.label || null;
        mine.state = 'paired';
        // A paired session is good for a working window, not forever.
        mine.expiresAt = Date.now() + 30 * 60 * 1000;
        emit();
        return status();
      }
      throw new Error('timeout');
    } catch (e) {
      if (session === mine) { mine.state = 'expired'; emit(); }
      throw e;
    }
  }

  /**
   * Ask the signer to approve and sign one action.
   *
   * The browser sends the ACTION and its FIELDS, never a pre-built string: the
   * signer builds the payload itself, stamps its own timestamp and shows the
   * human what they are approving. We get back only a signature, so a
   * compromised page cannot get anything else signed.
   */
  async function requestSignature(action, fields, human) {
    if (!isLive()) throw new Error('no-session');
    const mine = session;
    const id = hex(nacl.randomBytes(8));
    await publish(seal({ t: 'sign', id, action, fields, human: human || null }));

    const deadline = Date.now() + SIGN_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const msg = await receive(deadline, mine.abort.signal);
      if (session !== mine) throw new Error('cancelled');
      if (msg.t === 'rejected' && msg.id === id) throw new Error('rejected');
      if (msg.t === 'revoked') { end('revoked'); throw new Error('revoked'); }
      if (msg.t !== 'signed' || msg.id !== id) continue;
      if (!msg.signature || !msg.signingPublicKey || !msg.timestamp) {
        throw new Error('signer sent an incomplete signature');
      }
      // The signer may only ever sign for the address this session is bound to.
      if (msg.address && msg.address !== mine.address) throw new Error('address-mismatch');
      return {
        address: mine.address,
        signingPublicKey: msg.signingPublicKey,
        signature: msg.signature,
        timestamp: msg.timestamp,
      };
    }
    throw new Error('timeout');
  }

  /** Tear the session down and wipe key material from memory. */
  function end(reason) {
    if (!session) return;
    const mine = session;
    try { mine.abort.abort(); } catch { /* already gone */ }
    // Best-effort: tell the relay to drop the topic so nothing lingers.
    try {
      fetch(`${relayBase()}/api/pair/${mine.topic}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ close: true }),
        keepalive: true,
      }).catch(() => {});
    } catch { /* offline */ }
    if (mine.secretKey) mine.secretKey.fill(0);
    if (mine.publicKey) mine.publicKey.fill(0);
    session = null;
    if (reason !== 'replaced') emit();
  }

  // A session must not outlive the page. Nothing is persisted, but be explicit.
  global.addEventListener('pagehide', () => end('unload'));

  global.AistPairing = {
    begin, end, status, isLive, onChange, requestSignature,
    get address() { return session && session.address; },
  };
})(window);
