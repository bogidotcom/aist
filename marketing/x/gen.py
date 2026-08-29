#!/usr/bin/env python3
"""Render 16:9 X cards, one per post, per language.

Cards are stacked into batch pages and captured in one headless Chrome pass,
then split by PIL. Numbers stay LTR even inside an RTL card.
"""
import json, os, subprocess, sys, base64
from PIL import Image

W, H, BATCH = 1600, 900, 10
ROOT = os.path.dirname(os.path.abspath(__file__))

LANGS = {
 'en': {'dir':'ltr','disp':"'Sora',sans-serif",'sans':"'DM Sans',sans-serif",'hs':1.0,'lh':0.95},
 'es': {'dir':'ltr','disp':"'Sora',sans-serif",'sans':"'DM Sans',sans-serif",'hs':0.90,'lh':0.98},
 'pt': {'dir':'ltr','disp':"'Sora',sans-serif",'sans':"'DM Sans',sans-serif",'hs':0.90,'lh':0.98},
 'ar': {'dir':'rtl','disp':"'Noto Sans Arabic',sans-serif",'sans':"'Noto Sans Arabic',sans-serif",'hs':0.82,'lh':1.35},
 'fa': {'dir':'rtl','disp':"'Noto Sans Arabic',sans-serif",'sans':"'Noto Sans Arabic',sans-serif",'hs':0.82,'lh':1.35},
 'ur': {'dir':'rtl','disp':"'Noto Nastaliq Urdu',serif",'sans':"'Noto Nastaliq Urdu',serif",'hs':0.80,'lh':1.75},
 'bn': {'dir':'ltr','disp':"'Noto Sans Bengali',sans-serif",'sans':"'Noto Sans Bengali',sans-serif",'hs':0.80,'lh':1.35},
 'am': {'dir':'ltr','disp':"'Noto Sans Ethiopic',sans-serif",'sans':"'Noto Sans Ethiopic',sans-serif",'hs':0.78,'lh':1.35},
 'ky': {'dir':'ltr','disp':"'Noto Sans',sans-serif",'sans':"'Noto Sans',sans-serif",'hs':0.90,'lh':1.05},
}

LOGO = open(os.path.join(ROOT, '..', '..', 'assets', 'stork.svg'), 'rb').read()
LOGO_URI = 'data:image/svg+xml;base64,' + base64.b64encode(LOGO).decode()

CSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{background:#000}
.card{width:%(W)spx;height:%(H)spx;background:#070807;color:#f3f1ea;position:relative;
  overflow:hidden;display:flex;flex-direction:column;padding:54px 64px;font-family:%(SANS)s}
.card::before{content:"";position:absolute;top:-30%%;%(GLOWSIDE)s:-10%%;width:70%%;height:90%%;
  background:radial-gradient(closest-side,rgba(61,255,138,.14),transparent 70%%);pointer-events:none}
.card::after{content:"";position:absolute;inset:0;border:1px solid #1b1f19;pointer-events:none}
.brand{display:flex;align-items:center;gap:14px;position:relative;z-index:2}
.brand img{width:58px;height:58px}
.brand span{font-family:%(DISP)s;font-weight:700;font-size:29px;letter-spacing:-.03em}
.body{flex:1;display:grid;grid-template-columns:1fr 590px;gap:52px;align-items:center;
  position:relative;z-index:2;padding:18px 0}
.body.solo{grid-template-columns:1fr}
.kicker{color:#e8c56b;font-size:24px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;
  margin-bottom:26px;line-height:1.3}
h1{font-family:%(DISP)s;font-weight:700;font-size:%(HEAD)spx;line-height:%(LH)s;letter-spacing:-.035em;
  white-space:pre-line}
.foot{display:flex;align-items:center;gap:18px;position:relative;z-index:2;
  color:#5c6358;font-size:22px;letter-spacing:.02em}
.foot b{color:#3dff8a;font-weight:600}
pre{direction:ltr;text-align:left;background:#0d100c;border:1px solid #232821;border-radius:18px;
  padding:34px 36px;font-family:'IBM Plex Mono',monospace;font-size:27px;line-height:1.7;
  color:#8d9388;white-space:pre;overflow:hidden}
.chips{display:flex;flex-wrap:wrap;gap:14px}
.chip{border:1px solid #2c332a;background:#0d100c;border-radius:999px;padding:16px 30px;
  font-family:'IBM Plex Mono',monospace;font-size:29px;color:#3dff8a;white-space:nowrap}
.big{font-family:'IBM Plex Mono',monospace;font-size:210px;line-height:1;color:#3dff8a;
  letter-spacing:-.04em;direction:ltr;text-align:center}
"""

PAGE = """<!doctype html><html dir="%(DIR)s"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&family=Sora:wght@600;700&display=swap" rel="stylesheet">
<style>%(CSS)s</style></head><body>%(CARDS)s</body></html>"""


def card_html(spec, txt, cfg):
    lines = txt['head'].split('\n')
    head_len = max(len(l) for l in lines)
    # Size to the widest line so nothing re-wraps: left column is 830px when a
    # right-hand block is present, the full width when it is not.
    has_right = spec['v'] in ('num', 'list') or bool(spec.get('mono'))
    avail = 830 if has_right else 1430
    size = int(min(124, avail / (0.58 * max(head_len, 1))) * cfg['hs'])
    size = max(size, 46)
    right = ''
    if spec['v'] == 'num':
        right = '<div class="big">%s</div>' % spec['mono']
    elif spec['v'] == 'list':
        right = '<div class="chips">%s</div>' % ''.join(
            '<span class="chip">%s</span>' % c for c in spec.get('chips', []))
    elif spec.get('mono'):
        right = '<pre>%s</pre>' % spec['mono']
    solo = '' if right else ' solo'
    return """<div class="card" style="--hs:%(SZ)s">
  <div class="brand"><img src="%(LOGO)s" alt=""><span>AIST</span></div>
  <div class="body%(SOLO)s">
    <div><p class="kicker">%(K)s</p><h1 style="font-size:%(SZ)spx">%(HD)s</h1></div>
    <div>%(R)s</div>
  </div>
  <div class="foot"><b>aist.exchange</b><span>P2P compute forex</span></div>
</div>""" % {'LOGO': LOGO_URI, 'K': txt['kicker'], 'HD': txt['head'],
             'R': right, 'SZ': size, 'SOLO': solo}


def render(lang, specfile=None, txtfile=None, outname=None):
    cfg = LANGS[lang]
    spec = json.load(open(specfile or os.path.join(ROOT, 'data', 'spec.json')))
    txts = json.load(open(txtfile or os.path.join(ROOT, 'data', lang + '.json')))
    by_id = {t['id']: t for t in txts}
    outdir = os.path.join(ROOT, 'img', outname or lang)
    os.makedirs(outdir, exist_ok=True)
    css = CSS % {'W': W, 'H': H, 'DISP': cfg['disp'], 'SANS': cfg['sans'],
                 'LH': cfg['lh'], 'HEAD': 84,
                 'GLOWSIDE': 'left' if cfg['dir'] == 'rtl' else 'right'}
    for b in range(0, len(spec), BATCH):
        chunk = spec[b:b + BATCH]
        cards = ''.join(card_html(s, by_id[s['id']], cfg) for s in chunk)
        page = os.path.join(ROOT, '_page.html')
        # Headless Chrome clips ~40px off the bottom of the capture, so pad the
        # page with a spacer and grab extra height; crops stay on exact offsets.
        cards += '<div style="height:80px"></div>'
        open(page, 'w').write(PAGE % {'DIR': cfg['dir'], 'CSS': css, 'CARDS': cards})
        shot = os.path.join(ROOT, '_batch.png')
        subprocess.run(['google-chrome', '--headless=new', '--disable-gpu', '--no-sandbox',
                        '--hide-scrollbars', '--force-device-scale-factor=1',
                        '--virtual-time-budget=9000',
                        '--window-size=%d,%d' % (W, H * len(chunk) + 80),
                        '--screenshot=' + shot, 'file://' + page],
                       capture_output=True, timeout=180)
        im = Image.open(shot)
        for i, s in enumerate(chunk):
            im.crop((0, i * H, W, (i + 1) * H)).save(
                os.path.join(outdir, '%s.png' % s['id']), optimize=True)
        os.remove(shot); os.remove(page)
    print(lang, 'done ->', outdir)


def render_country(cc, lang):
    render(lang,
           specfile=os.path.join(ROOT, 'data', 'c', 'spec-%s.json' % cc),
           txtfile=os.path.join(ROOT, 'data', 'c', '%s-%s.json' % (cc, lang)),
           outname=os.path.join('c', '%s-%s' % (cc, lang)))


if __name__ == '__main__':
    if sys.argv[1] == 'country':
        for pair in sys.argv[2:]:
            cc, lang = pair.split(':')
            render_country(cc, lang)
    else:
        for l in sys.argv[1:]:
            render(l)
