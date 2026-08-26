(function (global) {
  const LANGS = ['en', 'ru', 'ky', 'cn'];

  function lang() {
    try { return localStorage.getItem('aist_lang') || 'en'; } catch { return 'en'; }
  }
  function setLang(l) {
    localStorage.setItem('aist_lang', l);
    apply();
    window.dispatchEvent(new CustomEvent('aist:lang', { detail: l }));
  }
  function t(key) {
    const pack = window.AIST_I18N || {};
    return (pack[lang()] && pack[lang()][key]) || (pack.en && pack.en[key]) || key;
  }
  function apply(root) {
    (root || document).querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    (root || document).querySelectorAll('[data-i18n-html]').forEach((el) => {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    (root || document).querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
    document.querySelectorAll('.lang button').forEach((b) => {
      b.classList.toggle('on', b.dataset.lang === lang());
    });
    document.documentElement.lang = lang();
  }

  function here() {
    const p = location.pathname.replace(/\/+$/, '') || '/';
    if (p.endsWith('/market') || p.endsWith('/market.html')) return 'market';
    if (p.endsWith('/exchange') || p.endsWith('/exchange.html')) return 'exchange';
    if (p.endsWith('/strategies') || p.endsWith('/strategies.html')) return 'strategies';
    return 'home';
  }

  function href(page) {
    const file = page === 'home' ? 'index.html' : page + '.html';
    if (location.protocol === 'file:') return file;
    if (page === 'home') return '/';
    return '/' + page;
  }

  async function mountChrome() {
    if (AistApi.resolveApi) await AistApi.resolveApi();
    const page = document.body.dataset.page || here();
    const header = document.getElementById('top');
    if (header) {
      header.innerHTML = `
        <div class="wrap wrap-wide top-in">
          <a class="brand" href="${href('home')}"><img src="assets/stork.svg" alt=""><span>AIST</span></a>
          <nav class="nav" id="nav">
            <a href="${href('market')}" class="${page === 'market' ? 'on' : ''}" data-i18n="nav.market">Market</a>
            <a href="${href('exchange')}" class="${page === 'exchange' ? 'on' : ''}" data-i18n="nav.exchange">Exchange</a>
            <a href="${href('strategies')}" class="${page === 'strategies' ? 'on' : ''}" data-i18n="nav.strategies">Strategies</a>
            <a href="https://iamai.kg/docs/#p2p" target="_blank" rel="noopener" data-i18n="nav.docs">Docs</a>
          </nav>
          <div class="top-right">
            <div class="lang" id="langs">${LANGS.map((l) => `<button type="button" data-lang="${l}">${l.toUpperCase()}</button>`).join('')}</div>
            <button class="icon-btn" id="settings-btn" title="Node" aria-label="Node">⚙</button>
            <button class="icon-btn burger" id="burger" aria-label="Menu">☰</button>
          </div>
        </div>`;
    }
    const foot = document.getElementById('foot');
    if (foot) {
      foot.innerHTML = `<div class="wrap wrap-wide foot-in"><span data-i18n="foot.tag">AIST Exchange</span><span>${AistApi.apiBase()}</span></div>`;
    }
    document.getElementById('langs')?.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-lang]');
      if (b) setLang(b.dataset.lang);
    });
    document.getElementById('burger')?.addEventListener('click', () => {
      document.getElementById('nav')?.classList.toggle('open');
    });
    document.getElementById('settings-btn')?.addEventListener('click', openSettings);
    apply();
  }

  function openSettings() {
    openModal(`
      <h3 data-i18n="set.title">Node</h3>
      <div class="field">
        <label data-i18n="set.api">P2P API origin</label>
        <input id="api-input" value="${AistApi.apiBase()}">
      </div>
      <button class="btn btn-lime btn-wide" id="api-save" data-i18n="set.save">Save</button>
    `);
    apply(document.getElementById('sheet'));
    document.getElementById('api-save').onclick = () => {
      AistApi.setApiBase(document.getElementById('api-input').value);
      location.reload();
    };
  }

  function ensureModal() {
    let m = document.getElementById('modal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'modal';
    m.className = 'modal';
    m.innerHTML = '<div class="sheet" id="sheet"></div>';
    m.addEventListener('click', (e) => { if (e.target === m) closeModal(); });
    document.body.appendChild(m);
    return m;
  }
  function openModal(html) {
    const m = ensureModal();
    document.getElementById('sheet').innerHTML = html;
    m.classList.add('open');
  }
  function closeModal() {
    document.getElementById('modal')?.classList.remove('open');
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch {}
      ta.remove(); return true;
    }
  }

  function toast(el, key) {
    if (!el) return;
    const prev = el.textContent;
    el.textContent = t(key);
    setTimeout(() => { el.textContent = prev; }, 1200);
  }

  global.AistUI = { lang, setLang, t, apply, here, href, mountChrome, openModal, closeModal, copy, toast };
})(window);
