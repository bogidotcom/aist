/* A DAI identity held by the browser.
 *
 * The aist:// pairing flow puts the key in the DAI Wallet app and asks it to
 * sign; this puts the key in this browser instead. That is a real downgrade in
 * safety and it is worth being blunt about which: the secret key lives in
 * localStorage, so anything that can run script on this origin can take it, and
 * whoever has it can move whatever that address holds. It is a hot key for a
 * throwaway trading account, not a place to keep a balance.
 *
 * No node change was needed. `POST /api/wallet/register-key` already accepts an
 * externally-generated key: the node derives the address from the key itself
 * (`dai` + the first 40 hex of sha256 over the base64 key text), so an address
 * cannot be claimed by anyone who does not hold the matching secret. Registering
 * creates a keyless wallet stub, which is what `verifyP2PAuth` needs to find via
 * resolveWallet before it will accept any signed P2P action.
 *
 * The signature format is fixed by the node: ed25519 over
 * JSON.stringify({ address, timestamp, action, ...fields }), base64. Key order
 * matters — the node rebuilds that object and re-serialises it — so `address`
 * comes first and `timestamp` second, always.
 */
(function (global) {
  const KEY = 'aist_dai_identity';
  const nacl = global.nacl;

  let cached = null;
  const listeners = new Set();
  function emit() { listeners.forEach((f) => { try { f(); } catch { /* listener */ } }); }

  function b64(bytes) {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  }
  function unb64(str) {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /* The node hashes the base64 TEXT of the key, not its bytes, and normalises
     line endings first. Hashing the bytes would derive a different address and
     every signature would verify against an account that does not exist. */
  async function deriveAddress(signingPublicKey) {
    const normalized = String(signingPublicKey).trim().replace(/\r\n/g, '\n');
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
    const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    return 'dai' + hex.slice(0, 40);
  }

  function load() {
    if (cached) return cached;
    let raw;
    try { raw = localStorage.getItem(KEY); } catch { return null; }
    if (!raw) return null;
    try {
      const j = JSON.parse(raw);
      if (!j.address || !j.signingPublicKey || !j.secretKey) return null;
      cached = { address: j.address, signingPublicKey: j.signingPublicKey,
                 secretKey: unb64(j.secretKey), registered: !!j.registered };
      return cached;
    } catch { return null; }
  }

  function persist(id) {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        address: id.address,
        signingPublicKey: id.signingPublicKey,
        secretKey: b64(id.secretKey),
        registered: !!id.registered,
      }));
    } catch { /* private window: identity lasts the session only */ }
  }

  function sign(id, message) {
    return b64(nacl.sign.detached(new TextEncoder().encode(message), id.secretKey));
  }

  /** Tell the node this address exists, so verifyP2PAuth can resolve it. */
  async function register(id) {
    const res = await fetch(AistApi.apiBase().replace(/\/$/, '') + '/api/wallet/register-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `proof` signs the bare address string — not JSON — which is what
      // register-key verifies against.
      body: JSON.stringify({
        address: id.address,
        signingPublicKey: id.signingPublicKey,
        proof: sign(id, id.address),
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) throw new Error(j.error || `register failed (${res.status})`);
    id.registered = true;
    persist(id);
    return id;
  }

  /** Existing identity, or a freshly generated and registered one. */
  async function ensure() {
    let id = load();
    if (!id) {
      if (!nacl) throw new Error('nacl-missing');
      const kp = nacl.sign.keyPair();
      const signingPublicKey = b64(kp.publicKey);
      id = {
        address: await deriveAddress(signingPublicKey),
        signingPublicKey,
        secretKey: kp.secretKey,
        registered: false,
      };
      cached = id;
      persist(id);
    }
    if (!id.registered) await register(id);
    emit();
    return id;
  }

  function status() {
    const id = load();
    return id
      ? { state: 'local', address: id.address, registered: id.registered }
      : { state: 'idle', address: null, registered: false };
  }

  function isLive() {
    const id = load();
    return !!(id && id.registered);
  }

  /**
   * Sign a P2P action. Mirrors AistPairing.requestSignature so the write path
   * does not care which signer is in use — `human` is what the paired app would
   * have displayed, and is ignored here because there is nobody else to show it
   * to. That difference is the whole security tradeoff: nothing outside this
   * page confirms what is being signed.
   */
  async function requestSignature(action, fields) {
    const id = await ensure();
    const timestamp = Date.now();
    const payload = { address: id.address, timestamp, action, ...fields };
    return {
      address: id.address,
      signingPublicKey: id.signingPublicKey,
      signature: sign(id, JSON.stringify(payload)),
      timestamp,
    };
  }

  /** Forget the key. Anything the address held stays on chain, unreachable. */
  function forget() {
    cached = null;
    try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
    emit();
  }

  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  global.AistIdentity = { ensure, status, isLive, requestSignature, forget, onChange, deriveAddress };
})(window);
