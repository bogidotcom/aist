#!/usr/bin/env python3
"""Builds the campaign plan page from posts.json.

    python3 plan.py            # index.html (local, images from img/) + web.html
    python3 plan.py --local    # index.html only, skip the slow thumbnail pass

index.html points at the PNGs on disk; web.html inlines every card as a small
WebP data URI so the single file can be published and read from a browser.
Thumbnails are cached in build/thumbs/ and only re-encoded when a PNG changes.
"""
import base64, hashlib, io, json, os, sys, html
from collections import OrderedDict

ROOT = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(ROOT, 'build', 'thumbs')
THUMB_W, THUMB_Q = 640, 72

sys.path.insert(0, ROOT)
from countries import COUNTRIES

LANG = {
    'en': ('English', 'ltr'), 'es': ('Español', 'ltr'), 'pt': ('Português', 'ltr'),
    'ar': ('العربية', 'rtl'), 'fa': ('فارسی', 'rtl'), 'ur': ('اردو', 'rtl'),
    'bn': ('বাংলা', 'ltr'), 'am': ('አማርኛ', 'ltr'), 'ky': ('Кыргызча', 'ltr'),
}
GLOBAL_LANGS = ['en', 'es', 'pt', 'ar', 'fa', 'ur', 'bn']
LIVE = {'et', 'bt', 'kg'}          # coins that actually trade today
TOPICS = ['Coin listing', 'Trade on P2P', 'Spread arbitrage', 'What P2P is',
          'Referrals', 'AI community', 'Why P2P', 'Payment-method arbitrage']

e = lambda s: html.escape(str(s or ''))


# ── thumbnails ────────────────────────────────────────────────────────────
def thumb(rel):
    """Small WebP of one card, as a data URI. Cached by source content."""
    src = os.path.join(ROOT, rel)
    if not os.path.exists(src):
        return ''
    st = os.stat(src)
    key = hashlib.sha1(f'{rel}|{st.st_size}|{int(st.st_mtime)}|{THUMB_W}|{THUMB_Q}'
                       .encode()).hexdigest()[:16]
    cached = os.path.join(CACHE, key + '.webp')
    if not os.path.exists(cached):
        from PIL import Image
        os.makedirs(CACHE, exist_ok=True)
        im = Image.open(src).convert('RGB')
        im = im.resize((THUMB_W, round(im.height * THUMB_W / im.width)), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, 'WEBP', quality=THUMB_Q, method=5)
        with open(cached, 'wb') as f:
            f.write(buf.getvalue())
    with open(cached, 'rb') as f:
        return 'data:image/webp;base64,' + base64.b64encode(f.read()).decode()


# ── one post ──────────────────────────────────────────────────────────────
def post_block(p, inline):
    name, dirn = LANG.get(p['lang'], (p['lang'], 'ltr'))
    n = len(p['text'])
    over = ' over' if n > 280 else ''
    img = ''
    src = thumb(p['image']) if inline else e(p['image'])
    if src and inline:
        img = f'<div class="shot"><img src="{src}" alt="{e(p["id"])} {e(p["lang"])}" loading="lazy"></div>'
    elif src:
        img = (f'<a class="shot" href="{src}" target="_blank" rel="noopener">'
               f'<img src="{src}" alt="{e(p["id"])} {e(p["lang"])}" loading="lazy"></a>')
    return f'''<div class="post" data-lang="{e(p['lang'])}">
  <div class="ptext">
    <div class="plang"><b>{e(name)}</b><span class="code">{e(p['lang'])}</span>
      <span class="chars{over}">{n} chars</span></div>
    <div class="copy"><button class="cp" type="button">copy</button><pre dir="{dirn}">{e(p['text'])}</pre></div>
  </div>
  {img}
</div>'''


def group(title, sub, posts, gid, inline, order=None):
    if order:
        posts = sorted(posts, key=lambda p: order.index(p['lang']) if p['lang'] in order else 99)
    body = ''.join(post_block(p, inline) for p in posts)
    return f'''<article class="item" id="{gid}">
  <div class="ihead"><div class="inum">{e(title)}</div><h3>{e(sub)}</h3></div>
  <div class="posts">{body}</div>
</article>'''


# ── page ──────────────────────────────────────────────────────────────────
CSS = '''
*,*::before,*::after{box-sizing:border-box}
:root{
  --bg:#0A0B09;--surface:#111310;--surface-2:#161A14;--ink:#F3F1EA;--ink-soft:#B4BAAD;
  --muted:#727A6B;--line:#232821;--gold:#E8C56B;--green:#3DFF8A;--warn:#FF7A5C;
}
body{margin:0;background:var(--bg);color:var(--ink);font-size:16px;line-height:1.6;
  font-family:"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased}
img{max-width:100%}
.mono{font-family:ui-monospace,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace}
.wrap{max-width:1140px;margin:0 auto;padding:0 24px}
h1,h2,h3{margin:0;letter-spacing:-.03em;text-wrap:balance}
p{margin:0}
a{color:var(--green)}

.rule{height:4px;background:linear-gradient(90deg,var(--gold),var(--green))}
header{padding:52px 0 34px;border-bottom:1px solid var(--line)}
.eyebrow{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;letter-spacing:.22em;
  text-transform:uppercase;color:var(--gold);font-weight:700}
h1{font-size:clamp(38px,6.5vw,66px);line-height:.95;font-weight:800;margin:14px 0 0}
h1 em{font-style:normal;color:var(--green)}
.lede{margin-top:18px;max-width:64ch;color:var(--ink-soft);font-size:18px}
.metarow{display:flex;flex-wrap:wrap;gap:9px;margin-top:24px}
.metarow span{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;letter-spacing:.06em;
  text-transform:uppercase;padding:6px 11px;border:1px solid var(--line);border-radius:2px;
  color:var(--ink-soft);background:var(--surface)}

nav{position:sticky;top:0;z-index:20;background:rgba(10,11,9,.94);
  backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.navin{display:flex;align-items:center;gap:12px;padding:9px 24px;max-width:1140px;margin:0 auto;
  overflow-x:auto;scrollbar-width:thin}
.navlabel{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--muted);white-space:nowrap}
.navin a{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--ink-soft);
  text-decoration:none;padding:4px 7px;border-radius:2px;white-space:nowrap;border:1px solid transparent}
.navin a:hover{background:var(--surface-2);color:var(--green)}
.navin a.dead{color:var(--muted)}
.navin a.dead::after{content:" ·";color:var(--warn)}

.tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:16px 0 0}
#q{flex:1 1 260px;min-width:200px;background:var(--surface);border:1px solid var(--line);
  border-radius:3px;color:var(--ink);padding:9px 12px;font-size:14px;font-family:inherit}
#q:focus{outline:2px solid var(--gold);outline-offset:-1px}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.08em;
  text-transform:uppercase;padding:6px 10px;border:1px solid var(--line);border-radius:999px;
  background:var(--surface);color:var(--ink-soft);cursor:pointer}
.chip.on{border-color:var(--green);color:var(--green)}
.count{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;color:var(--muted)}

section{padding:48px 0}
.sechead{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
.secnum{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--muted);letter-spacing:.1em}
h2{font-size:clamp(23px,3.2vw,32px);font-weight:800;text-transform:uppercase}
.secsub{color:var(--ink-soft);max-width:66ch;margin-top:10px;font-size:15.5px}

.warn{margin-top:26px;background:var(--surface);border:1px solid var(--line);
  border-left:3px solid var(--warn);border-radius:0 3px 3px 0;padding:20px 22px}
.warn h4{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--warn);margin:0 0 12px;font-weight:700}
.warn ul{margin:0;padding-left:18px;color:var(--ink-soft);font-size:15px}
.warn li{margin-bottom:8px}
.warn li:last-child{margin-bottom:0}
.warn b{color:var(--ink)}

.tags{margin-top:22px;background:var(--surface);border:1px solid var(--line);
  border-left:3px solid var(--green);border-radius:0 3px 3px 0;padding:18px 22px}
.tags h4{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--green);margin:0 0 10px;font-weight:700}
.tags p{color:var(--ink-soft);font-size:15px;max-width:70ch}
.tags b{color:var(--ink)}
.tagmap{margin-top:12px!important;font-family:ui-monospace,Menlo,monospace;font-size:12px;
  color:var(--muted);max-width:none!important;line-height:1.9}
.tagmap b{color:var(--gold);font-weight:400}

.ctable{overflow-x:auto;margin-top:24px;border:1px solid var(--line);border-radius:3px;background:var(--surface)}
table{border-collapse:collapse;width:100%;min-width:620px;font-size:14px}
th,td{padding:10px 14px;text-align:left;border-bottom:1px solid var(--line)}
th{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--muted);font-weight:700;background:var(--surface-2)}
tr:last-child td{border-bottom:none}
td a{text-decoration:none}
.tick{color:var(--green);font-weight:700}
.cross{color:var(--warn)}
.coin{font-family:ui-monospace,Menlo,monospace;color:var(--gold)}

.cblock{padding:40px 0 0;scroll-margin-top:56px}
.chead{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;padding-bottom:6px;
  border-bottom:1px solid var(--line)}
.chead h2{font-size:26px}
.badge{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;letter-spacing:.12em;
  text-transform:uppercase;padding:4px 9px;border-radius:2px;font-weight:700}
.b-live{color:#08120B;background:var(--green)}
.b-hold{color:var(--warn);border:1px solid var(--warn)}
.cmeta{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--muted);margin-top:10px}
.cmeta b{color:var(--ink-soft);font-weight:400}

.item{padding:26px 0;border-top:1px solid var(--line);scroll-margin-top:56px}
.item:first-child{border-top:none}
.ihead{margin-bottom:4px}
.inum{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;letter-spacing:.1em;
  text-transform:uppercase;color:var(--gold);font-weight:700}
.ihead h3{font-size:21px;font-weight:700;margin-top:5px;line-height:1.25}

.posts{display:flex;flex-direction:column}
.post{display:grid;grid-template-columns:1fr 300px;gap:22px;padding:16px 0;
  border-top:1px dotted var(--line);align-items:start}
.post:first-child{border-top:none}
.ptext{min-width:0}
.plang{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap;
  font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase}
.plang b{color:var(--ink);font-weight:700;font-family:inherit}
.code{color:var(--muted)}
.chars{color:var(--muted);margin-left:auto}
.chars.over{color:var(--warn);font-weight:700}
.copy{position:relative;margin-top:8px;background:var(--surface);border:1px solid var(--line);border-radius:3px}
.copy pre{margin:0;padding:14px 52px 14px 15px;white-space:pre-wrap;word-wrap:break-word;
  font-family:inherit;font-size:15px;line-height:1.55;color:var(--ink)}
.copy pre[dir="rtl"]{text-align:right;padding:14px 15px 14px 52px}
.cp{position:absolute;top:7px;right:7px;font-family:ui-monospace,Menlo,monospace;font-size:10px;
  letter-spacing:.08em;text-transform:uppercase;color:var(--muted);background:var(--surface-2);
  border:1px solid var(--line);border-radius:2px;padding:3px 7px;cursor:pointer}
.cp:hover{color:var(--green);border-color:var(--green)}
.cp.done{color:var(--gold);border-color:var(--gold)}
.shot{display:block;border:1px solid var(--line);border-radius:3px;overflow:hidden;
  background:var(--surface-2);margin-top:26px}
.shot img{display:block;width:100%;height:auto}
.shot:focus-visible{outline:2px solid var(--gold);outline-offset:2px}

footer{padding:40px 0 64px;border-top:1px solid var(--line);color:var(--muted);font-size:14px;margin-top:40px}
.hide{display:none!important}
@media (max-width:860px){
  .post{grid-template-columns:1fr;gap:12px}
  .shot{margin-top:0;max-width:420px}
  .chars{margin-left:0}
}
'''

JS = '''
document.addEventListener("click",function(ev){
  var b=ev.target.closest(".cp"); if(!b) return;
  var pre=b.parentElement.querySelector("pre"); if(!pre) return;
  var done=function(){b.textContent="copied";b.classList.add("done");
    setTimeout(function(){b.textContent="copy";b.classList.remove("done")},1500)};
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(pre.textContent).then(done,sel)}else{sel()}
  function sel(){var r=document.createRange();r.selectNodeContents(pre);
    var s=window.getSelection();s.removeAllRanges();s.addRange(r);
    b.textContent="selected";setTimeout(function(){b.textContent="copy"},1500)}
});
(function(){
  var q=document.getElementById("q"),chips=[].slice.call(document.querySelectorAll(".chip")),
      posts=[].slice.call(document.querySelectorAll(".post")),
      items=[].slice.call(document.querySelectorAll(".item")),
      out=document.getElementById("count"),lang="";
  posts.forEach(function(p){p._t=p.textContent.toLowerCase()});
  items.forEach(function(i){i._t=i.querySelector(".ihead").textContent.toLowerCase()});
  function run(){
    var s=q.value.trim().toLowerCase(),n=0;
    items.forEach(function(it){
      var hit=!s||it._t.indexOf(s)>-1,shown=0;
      [].slice.call(it.querySelectorAll(".post")).forEach(function(p){
        var ok=(!lang||p.dataset.lang===lang)&&(hit||!s||p._t.indexOf(s)>-1);
        p.classList.toggle("hide",!ok); if(ok){shown++;n++}
      });
      it.classList.toggle("hide",!shown);
    });
    [].slice.call(document.querySelectorAll(".cblock")).forEach(function(c){
      c.classList.toggle("hide",!c.querySelector(".item:not(.hide)"));
    });
    out.textContent=n+" of ''' + '{TOTAL}' + ''' posts";
  }
  q.addEventListener("input",run);
  chips.forEach(function(c){c.addEventListener("click",function(){
    var was=c.classList.contains("on");
    chips.forEach(function(x){x.classList.remove("on")});
    if(!was){c.classList.add("on");lang=c.dataset.lang}else{lang=""}
    run();
  })});
  run();
})();
'''


def build(inline):
    posts = json.load(open(os.path.join(ROOT, 'posts.json'), encoding='utf-8'))
    glob = [p for p in posts if p['set'] == 'global']
    ctry = [p for p in posts if p['set'] == 'country']

    # ── global: one item per post id, all seven languages under it
    by_id = OrderedDict()
    for p in glob:
        by_id.setdefault(p['id'], []).append(p)
    gitems = []
    for pid, group_posts in by_id.items():
        en = next((p for p in group_posts if p['lang'] == 'en'), group_posts[0])
        gitems.append(group(f"{pid} · {en['pillar']}", en['headline'],
                            group_posts, f'g{pid}', inline, GLOBAL_LANGS))

    # ── countries
    cblocks, navc = [], []
    for code, name, coin, cur, curname, rate, lang in COUNTRIES:
        mine = [p for p in ctry if p['id'].startswith(code + '-')]
        if not mine:
            continue
        live = code in LIVE
        order = ['en'] + ([lang] if lang != 'en' else [])
        items = []
        for i in range(1, 9):
            sub = [p for p in mine if p['id'] == f'{code}-{i}']
            if not sub:
                continue
            en = next((p for p in sub if p['lang'] == 'en'), sub[0])
            items.append(group(f"{code}-{i} · {TOPICS[i-1]}", en['headline'],
                               sub, f'{code}-{i}', inline, order))
        badge = ('<span class="badge b-live">coin live</span>' if live else
                 '<span class="badge b-hold">do not publish yet</span>')
        lname = LANG.get(lang, (lang, 'ltr'))[0]
        cblocks.append(f'''<div class="cblock" id="c-{code}">
  <div class="chead"><h2>{e(name)}</h2><span class="coin mono">{e(coin)}</span>{badge}</div>
  <p class="cmeta">local language <b>{e(lname)} ({e(lang)})</b> · reference rate <b>1 USD = {rate:,.6g} {e(cur)}</b> · 8 posts × {len(order)} language{"s" if len(order) > 1 else ""}</p>
  {''.join(items)}
</div>''')
        navc.append(f'<a href="#c-{code}"{"" if live else ' class="dead"'}>{code}</a>')

    lang_c = {}
    for c in COUNTRIES:
        lang_c.setdefault(c[6], []).append(c[1])
    tagmap = ' · '.join(
        f'<b>{l}</b> → ' + ' '.join('#' + n for n in lang_c[l])
        for l in ['es', 'ar', 'pt', 'fa', 'ur', 'bn', 'am', 'ky'] if l in lang_c)

    chips = ''.join(f'<button class="chip" type="button" data-lang="{l}">{e(LANG[l][0])}</button>'
                    for l in ['en', 'es', 'pt', 'ar', 'fa', 'ur', 'bn', 'am', 'ky'])
    rows = ''.join(
        f'<tr><td><a href="#c-{c[0]}">{e(c[1])}</a></td><td class="coin">{e(c[2])}</td>'
        f'<td>{e(LANG.get(c[6], (c[6],))[0])}</td>'
        f'<td class="{"tick" if c[0] in LIVE else "cross"}">{"live" if c[0] in LIVE else "not listed"}</td>'
        f'<td class="mono">1 USD = {c[5]:,.6g} {e(c[3])}</td></tr>' for c in COUNTRIES)

    return f'''<title>AIST X Campaign</title>
<meta name="description" content="{len(posts)} ready-to-post X posts for AIST — 30 global posts in 7 languages and 14 country sets, each with its 16:9 card.">
<style>{CSS}</style>

<div class="rule"></div>
<header><div class="wrap">
  <div class="eyebrow">AIST P2P · aist.exchange · X / Twitter</div>
  <h1>Content plan · <em>{len(posts)}</em> posts</h1>
  <p class="lede">Every post is written, under 280 characters and paired with a 1600×900 card.
  Thirty global posts in seven languages, fourteen country sets of eight. Hit <b>copy</b>, paste into
  the scheduler, attach the card next to it.</p>
  <div class="metarow">
    <span>{len(glob)} global</span><span>{len(ctry)} country</span>
    <span>7 languages global</span><span>14 countries</span><span>426 cards 16:9</span>
    <span>all &lt; 280 chars</span><span>#p2p on every post</span>
  </div>
</div></header>

<nav><div class="navin">
  <span class="navlabel">Jump</span>
  <a href="#brief">Before scheduling</a>
  <a href="#global">Global 01–30</a>
  <span class="navlabel">Countries</span>
  {''.join(navc)}
  <span class="navlabel">· coin not listed yet</span>
</div></nav>

<section id="brief"><div class="wrap">
  <div class="sechead"><span class="secnum">00</span><h2>Read before scheduling</h2></div>
  <p class="secsub">Four things in this plan are true on paper and not yet true in the product.
  Each one is a false claim if it ships before the thing it describes exists.</p>

  <div class="warn">
    <h4>Do not publish blind</h4>
    <ul>
      <li><b>Eleven of the fourteen coins do not exist yet.</b> Only <span class="coin mono">aiETB</span>,
        <span class="coin mono">aiBTN</span> and <span class="coin mono">KGST</span> trade today.
        Post 1 of every country set announces the coin as live — hold the other eleven sets until they list.</li>
      <li><b>The referral posts carry no commission rate.</b> Nothing in the repo defines the programme,
        so the copy says what happens without a number. Insert the real terms in the copy and in
        <span class="mono">mono_for()["5"]</span> before posting.</li>
      <li><b>FX reference rates are illustrative.</b> Every worked example is computed from one USD rate
        per country, so the arithmetic is consistent but the levels drift. Refresh
        <span class="mono">COUNTRIES</span> in <span class="mono">countries.py</span> and re-run before a launch.</li>
      <li><b>Iran is quoted in rial.</b> Iranian traders usually think in toman (1 toman = 10 rial).
        If the coin lists as <span class="coin mono">aiIRT</span>, regenerate the Iran set.</li>
    </ul>
  </div>

  <div class="ctable"><table>
    <thead><tr><th>Country</th><th>Coin</th><th>Local language</th><th>Status</th><th>Reference rate</th></tr></thead>
    <tbody>{rows}</tbody>
  </table></div>

  <div class="tags">
    <h4>Hashtags</h4>
    <p>Every post ends with <b>#p2p</b>. A post that is actually going out also carries the
    countries it targets — the global set tags every campaign country that speaks its language,
    a country post tags its own country. English is review copy and carries <b>#p2p</b> alone;
    Bhutan is the exception, English is the language it posts in.</p>
    <p class="tagmap">{tagmap}</p>
  </div>

  <div class="tools">
    <input id="q" type="search" placeholder="Filter by pillar, topic or headline…" autocomplete="off">
    <div class="chips">{chips}</div>
    <span class="count" id="count"></span>
  </div>
</div></section>

<section id="global"><div class="wrap">
  <div class="sechead"><span class="secnum">01</span><h2>Global set · 30 posts</h2></div>
  <p class="secsub">Built from the landing page and <span class="mono">/strategies</span>. Six pillars:
  launch (01–03), the eight strategies (04–11), rules and risk (12–18), assets and rails (19–23),
  compute payout for miners (24–27), P2P liquidity (28–30). Same post in English, Spanish, Portuguese,
  Arabic, Persian, Urdu and Bengali — numbers are never translated.</p>
  {''.join(gitems)}
</div></section>

<section id="countries"><div class="wrap">
  <div class="sechead"><span class="secnum">02</span><h2>Country sets · 14 × 8</h2></div>
  <p class="secsub">The same eight topics everywhere: coin listing, trading on P2P, simple spread arbitrage,
  what P2P is, referrals, the local AI community, why P2P, payment-method arbitrage. Each country ships an
  English master for review and the local language for posting — Bhutan is English only.</p>
  {''.join(cblocks)}
</div></section>

<footer><div class="wrap">
  <p>AIST · X campaign · {len(posts)} posts, {len(posts)} cards at 1600×900.</p>
  <p style="margin-top:6px">Copy lives in <span class="mono">data/</span>, cards are rendered by
  <span class="mono">gen.py</span>, this page is built by <span class="mono">plan.py</span>.
  Regenerate: <span class="mono">python3 countries.py &amp;&amp; python3 gen.py &lt;langs&gt; &amp;&amp; python3 export.py &amp;&amp; python3 plan.py</span></p>
</div></footer>

<script>{JS.replace('{TOTAL}', str(len(posts)))}</script>'''


def wrap(body):
    return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
            + body + '\n</body>\n</html>\n')


if __name__ == '__main__':
    local_only = '--local' in sys.argv
    out = os.path.join(ROOT, 'index.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(wrap(build(inline=False)))
    print(f'  index.html  {os.path.getsize(out)/1024:.0f} KB  (images from img/)')
    if local_only:
        sys.exit(0)
    body = build(inline=True)
    out = os.path.join(ROOT, 'web.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(wrap(body))
    print(f'  web.html    {os.path.getsize(out)/1024/1024:.1f} MB  (self-contained)')
    # body-only fragment: what gets published as an Artifact
    os.makedirs(os.path.join(ROOT, 'build'), exist_ok=True)
    out = os.path.join(ROOT, 'build', 'artifact.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(body + '\n')
    print(f'  build/artifact.html  {os.path.getsize(out)/1024/1024:.1f} MB  (for publishing)')
