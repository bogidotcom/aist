/* Pairing UI — the modal that connects a signer to this browser session.
 *
 * Shows a QR for a phone and a copyable link for a desktop signer. Both encode
 * the same thing: the relay, a 32-byte topic, and this session's public key.
 * The topic is the capability, so the QR is the secret — it is rendered locally
 * and never sent to any third party.
 */
(function (global) {
  let resolveConnect = null;

  function fmtLeft(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  function sheet() { return document.getElementById('sheet'); }

  function renderPairing(uri) {
    AistUI.openModal(`
      <h3>${AistUI.t('pair.title')}</h3>
      <p class="hint">${AistUI.t('pair.intro')}</p>
      <div class="pair-qr"><canvas id="pair-canvas" width="220" height="220"></canvas></div>
      <p class="hint" style="margin-top:12px">${AistUI.t('pair.orLink')}</p>
      <div class="pair-link">
        <code id="pair-uri">${uri.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</code>
      </div>
      <div class="row-btns" style="margin-top:10px">
        <button class="btn btn-ghost" id="pair-copy">${AistUI.t('ex.copy')}</button>
        <button class="btn btn-ghost" id="pair-cancel">${AistUI.t('pair.cancel')}</button>
      </div>
      <p class="hint" id="pair-status">${AistUI.t('pair.waiting')}</p>
      <p class="hint pair-warn">${AistUI.t('pair.memoryOnly')}</p>
    `);

    const canvas = document.getElementById('pair-canvas');
    if (global.AistQR && canvas) {
      AistQR.toCanvas(canvas, uri, {
        width: 220, margin: 1,
        color: { dark: '#f3f1ea', light: '#101210' },
        errorCorrectionLevel: 'M',
      }).catch(() => {
        // Never fall back to a remote QR service — that would hand the topic,
        // which is the session capability, to a third party.
        canvas.replaceWith(Object.assign(document.createElement('p'), {
          className: 'hint', textContent: AistUI.t('pair.qrFailed'),
        }));
      });
    }

    document.getElementById('pair-copy')?.addEventListener('click', async (e) => {
      await AistUI.copy(uri);
      AistUI.toast(e.currentTarget, 'ex.copied');
    });
    document.getElementById('pair-cancel')?.addEventListener('click', () => {
      AistPairing.end('cancelled');
      AistUI.closeModal();
      if (resolveConnect) { resolveConnect(false); resolveConnect = null; }
    });
  }

  /** Open the pairing modal and resolve true once a signer is attached. */
  async function connect() {
    // aist:// connect-wallet flow (QR + deep link) is commented out.
    return false;
    /* if (AistPairing.isLive()) return true;
    const { uri, waitForSigner } = AistPairing.begin();
    renderPairing(uri);

    const started = Date.now();
    const tick = setInterval(() => {
      const el = document.getElementById('pair-status');
      const st = AistPairing.status();
      if (!el || st.state !== 'pairing') return clearInterval(tick);
      el.textContent = AistUI.t('pair.waiting') + ' · ' + fmtLeft(st.expiresAt - Date.now());
    }, 1000);

    const done = new Promise((r) => { resolveConnect = r; });
    try {
      const st = await Promise.race([waitForSigner, done.then((v) => { if (!v) throw new Error('cancelled'); })]);
      clearInterval(tick);
      if (st && st.address) {
        AistUI.closeModal();
        resolveConnect = null;
        return true;
      }
      return false;
    } catch (e) {
      clearInterval(tick);
      const el = document.getElementById('pair-status');
      if (el) {
        el.textContent = (e && e.message) === 'timeout'
          ? AistUI.t('pair.timeout') : AistUI.t('pair.failed');
      }
      resolveConnect = null;
      return false;
    } */
  }

  /** Small header control: shows the paired address and allows revoking it. */
  function mountIndicator(host) {
    // aist:// "Connect signer" button — disabled.
    if (host) host.innerHTML = '';
    return;
    /* if (!host) return;
    const draw = () => {
      const st = AistPairing.status();
      if (st.state !== 'paired') {
        host.innerHTML = `<button class="btn btn-ghost btn-sm" id="pair-open">${AistUI.t('pair.connect')}</button>`;
        host.querySelector('#pair-open')?.addEventListener('click', () => connect());
        return;
      }
      host.innerHTML = `
        <span class="pair-chip" title="${st.address}">
          <span class="pair-dot"></span>${st.address.slice(0, 10)}…
          <button class="pair-x" id="pair-revoke" aria-label="${AistUI.t('pair.revoke')}">×</button>
        </span>`;
      host.querySelector('#pair-revoke')?.addEventListener('click', () => {
        AistPairing.end('revoked');
      });
    };
    draw();
    AistPairing.onChange(draw);
    */
  }

  global.AistPairUI = { connect, mountIndicator };
})(window);
