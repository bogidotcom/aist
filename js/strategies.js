/* Strategy cards. Copy lives in js/i18n.strategies.js; the numbers below are
   deliberately language-neutral — tickers, sizes and prices read the same in
   every locale, so only the labels around them are translated. */
(function (global) {
  const t = () => global.AistUI.t;

  const LIST = [
    {
      id: 'spread',
      flow: ["buy · best ask 0.01188", "sell · best bid 0.01243"],
      level: 1,
      ex: `pair       KGST-USDT-TRC20
best ask   0.01188    size 60,000
best bid   0.01243    size 50,000
────────────────────────────────────
buy    50,000 KGST @ 0.01188 =  594.00
sell   50,000 KGST @ 0.01243 =  621.50
fees   2× TRC20                  -2.00
net    <b>+25.50 USDT</b>   (4.3%)`,
    },
    {
      id: 'payment',
      flow: ["buy · cash 87.90", "USDT", "sell · bank 89.60"],
      level: 1,
      ex: `asset   USDT-TRC20, quoted in KGS
buy   via cash deposit       87.90
sell  via bank transfer      89.60
────────────────────────────────────
size    1,000 USDT
out     -87,900 KGS
in      +89,600 KGS
net     <b>+1,700 KGS</b>   (1.9%)
hold    ~40 min bank clearing`,
    },
    {
      id: 'cross',
      flow: ["Binance ask 0.01180", "AIST P2P bid 0.01245"],
      level: 2,
      ex: `Binance    KGST/USDT        ask 0.01180
AIST P2P   KGST-USDT-TRC20  bid 0.01245
────────────────────────────────────
buy   100,000 KGST @ 0.01180 = 1,180.00
sell  100,000 KGST @ 0.01245 = 1,245.00
withdraw + network              -3.20
net   <b>+61.80 USDT</b>   (5.2%)`,
    },
    {
      id: 'geo',
      flow: ["KGS", "USDT", "GEL", "KGS"],
      level: 2,
      ex: `leg 1   87,900 KGS  →  1,000 USDT   Bishkek
leg 2    1,000 USDT →  2,690 GEL    Tbilisi
leg 3    2,690 GEL  → 89,400 KGS    bank cross
────────────────────────────────────
net     <b>+1,500 KGS</b>   (1.7% per loop)
cycle   1–2 days`,
    },
    {
      id: 'mm',
      flow: ["your bid −1.0%", "mid 0.01200", "your ask +1.0%"],
      level: 2,
      ex: `mid          0.01200 USDT per KGST
your bid     0.01188   (-1.0%)
your ask     0.01212   (+1.0%)
size         25,000 KGST per side
────────────────────────────────────
round trip   <b>+6.00 USDT</b>  (2.0% of one side)
5 trips/day  +30.00 USDT`,
    },
    {
      id: 'inventory',
      flow: ["buy 0.01150", "hold 4 days", "sell 0.01245"],
      level: 3,
      ex: `day 1   buy  200,000 KGST @ 0.01150 = 2,300
day 4   sell 200,000 KGST @ 0.01245 = 2,490
────────────────────────────────────
net     <b>+190 USDT</b>   (8.3%)
but     -10% move = <b>-230 USDT</b> on that size`,
    },
    {
      id: 'liquidity',
      flow: ["float 10,000 USDT", "4 methods", "~18 fills / day"],
      level: 2,
      ex: `float        10,000 USDT across 4 methods
fills        ~18 / day, ~600 USDT each
avg edge     0.55% per fill
────────────────────────────────────
turnover     ~10,800 USDT / day
gross        <b>+59 USDT</b> / day  (0.59% of float)
escrow idle  ~25% of float at any time`,
    },
    {
      id: 'triangular',
      flow: ["USDT", "KGST", "aiGEL", "USDT"],
      level: 3,
      ex: `leg 1   1,000 USDT-TRC20 → 83,330 KGST  @ 0.01200
leg 2  83,330 KGST      →  1,206 aiGEL @ 69.10
leg 3   1,206 aiGEL     →  1,019 USDT  @ 0.845
────────────────────────────────────
fees    3 legs                     -3.00
net     <b>+16.00 USDT</b>   (1.6%)`,
    },
  ];

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function renderCards(el) {
    const tr = t();
    el.innerHTML = LIST.map((s, i) => `
      <section class="strat" id="${s.id}">
        <div class="strat-head">
          <span class="n">${pad(i + 1)}</span>
          <h2>${esc(tr('st.' + s.id + '.n'))}</h2>
          <span class="lvl lvl-${s.level}">${esc(tr('st.lvl' + s.level))}</span>
        </div>
        <p class="sum">${esc(tr('st.' + s.id + '.s'))}</p>
        <div class="strat-flow">${(s.flow || []).map((f, n, a) => `
          <span class="fnode${n === a.length - 1 ? ' acc' : ''}">${esc(f)}</span>${
            n < a.length - 1 ? '<span class="farrow">&rarr;</span>' : ''}`).join('')}</div>
        <div class="two">
          <div>
            <p class="sub">${esc(tr('st.how'))}</p>
            <ol class="how">
              ${[1, 2, 3, 4].map((n) => `<li>${esc(tr('st.' + s.id + '.h' + n))}</li>`).join('')}
            </ol>
          </div>
          <div>
            <p class="sub">${esc(tr('st.example'))}</p>
            <pre class="ex">${s.ex}</pre>
          </div>
        </div>
        <p class="risk"><b>${esc(tr('st.risk'))}.</b> ${esc(tr('st.' + s.id + '.r'))}</p>
      </section>`).join('');
  }

  function renderToc(el) {
    const tr = t();
    el.innerHTML = LIST.map((s) => `<li><a href="#${s.id}">${esc(tr('st.' + s.id + '.n'))}</a></li>`).join('');
  }

  function mountPage(tocEl, cardsEl) {
    const draw = () => {
      if (tocEl) renderToc(tocEl);
      if (cardsEl) renderCards(cardsEl);
    };
    draw();
    global.addEventListener('aist:lang', draw);
  }

  function mountChips(el) {
    if (!el) return;
    const base = global.AistUI.href('strategies');
    const draw = () => {
      const tr = t();
      el.innerHTML = LIST.map((s, i) => `
        <a class="chip" href="${base}#${s.id}"><i>${pad(i + 1)}</i>${esc(tr('st.' + s.id + '.n'))}</a>`).join('');
    };
    draw();
    global.addEventListener('aist:lang', draw);
  }

  global.AistStrategies = { LIST, mountPage, mountChips };
})(window);
