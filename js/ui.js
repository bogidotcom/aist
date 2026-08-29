(function (global) {
  const LANGS = ['en', 'ru', 'ky', 'cn', 'es', 'pt', 'ar', 'fa', 'ur', 'bn'];
  const LANG_NAME = {
    en: 'English', ru: 'Русский', ky: 'Кыргызча', cn: '中文', es: 'Español',
    pt: 'Português', ar: 'العربية', fa: 'فارسی', ur: 'اردو', bn: 'বাংলা',
  };
  const RTL = new Set(['ar', 'fa', 'ur']);

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
    const sel = document.getElementById('langs');
    if (sel) sel.value = lang();
    document.documentElement.lang = lang();
    document.documentElement.dir = RTL.has(lang()) ? 'rtl' : 'ltr';
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
            <select class="lang" id="langs" aria-label="Language">
              ${LANGS.map((l) => `<option value="${l}">${LANG_NAME[l]}</option>`).join('')}
            </select>
            <button class="icon-btn" id="settings-btn" title="Node" aria-label="Node">⚙</button>
            <button class="icon-btn burger" id="burger" aria-label="Menu">☰</button>
          </div>
        </div>`;
    }
    const foot = document.getElementById('foot');
    if (foot) {
      foot.innerHTML = `
        <div class="wrap wrap-wide foot-in">
          <span data-i18n="foot.tag">AIST Exchange</span>
          <div class="foot-social">
            <a href="https://x.com/aist_exchange" target="_blank" rel="noopener me" aria-label="X" title="X">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
            <a href="https://t.me/aist_exchange" target="_blank" rel="noopener me" aria-label="Telegram" title="Telegram">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24zm4.906 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
            </a>
          </div>
          <span class="foot-api">${AistApi.apiBase()}</span>
        </div>`;
    }
    document.getElementById('langs')?.addEventListener('change', (e) => {
      setLang(e.target.value);
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
