#!/usr/bin/env python3
"""Export the campaign as markdown (review), JSON and CSV (scheduling)."""
import json, os, csv, glob, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)
from countries import COUNTRIES

GLOBAL_LANGS = [('en','English'),('es','Spanish'),('pt','Portuguese'),
                ('ar','Arabic'),('fa','Persian'),('ur','Urdu'),('bn','Bengali')]
LANGNAME = dict(GLOBAL_LANGS + [('am','Amharic'),('ky','Kyrgyz')])
PILLAR = {**{f"{i:02d}":"Launch" for i in range(1,4)},
          **{f"{i:02d}":"Strategy" for i in range(4,12)},
          **{f"{i:02d}":"Rules & risk" for i in range(12,19)},
          **{f"{i:02d}":"Assets & rails" for i in range(19,24)},
          **{f"{i:02d}":"Compute payout" for i in range(24,28)},
          **{f"{i:02d}":"P2P liquidity" for i in range(28,31)}}
TOPIC = ["ai<CUR> listed on P2P","Trade on P2P","Simple spread arbitrage",
         "What is P2P (edu)","Referral programme","Growing AI community",
         "Why P2P — no middleman","Payment-method arbitrage"]

# ── hashtags ───────────────────────────────────────────────────────────────
# Every post ends with #p2p. A post that is actually going out also carries the
# countries it targets: the global set tags every campaign country that speaks
# its language, a country post tags its own country. The English global set and
# the English country masters are review copy, so they carry #p2p alone —
# Bhutan is the exception, English is the language it posts in.
LANG_COUNTRIES = {}
for _c in COUNTRIES:
    LANG_COUNTRIES.setdefault(_c[6], []).append(_c[1])

def tags(lang, code=None):
    if code:
        row = next(c for c in COUNTRIES if c[0] == code)
        names = [row[1]] if lang == row[6] else []
    else:
        names = [] if lang == 'en' else LANG_COUNTRIES.get(lang, [])
    return " ".join(["#p2p"] + ["#" + n for n in names])

# In an RTL post the tag line's leading "#" is a neutral character at the start
# of the line, so bidi resolves it to the paragraph direction and paints it at
# the far end: "#p2p #Egypt #Iraq #Libya #Sudan" displays as
# "p2p #Egypt #Iraq #Libya #Sudan#". X renders the tweet the same way. A
# left-to-right mark in front of the line anchors it and costs one character.
RTL = {'ar', 'fa', 'ur'}
LRM = '\u200e'

def tagged(post, lang, code=None):
    line = tags(lang, code)
    return f"{post}\n\n{LRM if lang in RTL else ''}{line}"

rows = []

def load(path):
    return json.load(open(path))

def build():
    # global set
    out = ["# AIST — X campaign, global set\n",
           "30 posts. Each row lists the image and the copy in all seven languages.\n"]
    packs = {l: {p['id']: p for p in load(f"{ROOT}/data/{l}.json")} for l, _ in GLOBAL_LANGS}
    for pid in [f"{i:02d}" for i in range(1, 31)]:
        out.append(f"\n---\n\n## {pid} · {PILLAR[pid]}\n")
        for l, ln in GLOBAL_LANGS:
            p = packs[l][pid]
            img = f"img/{l}/{pid}.png"
            post = tagged(p['post'], l)
            out.append(f"**{ln}** — `{img}`\n\n```\n{post}\n```\n")
            rows.append(dict(set="global", id=pid, pillar=PILLAR[pid], country="",
                             lang=l, image=img, headline=p['head'].replace("\n"," "),
                             text=post))
    open(f"{ROOT}/posts-global.md", "w").write("\n".join(out))

    # country set
    out = ["# AIST — X campaign, country rollout\n",
           "14 countries x 8 posts. English master plus the local language.\n"]
    for code, name, coin, cur, curname, rate, lang in COUNTRIES:
        langs = ['en'] if lang == 'en' else ['en', lang]
        out.append(f"\n---\n\n# {name} · {coin} · {cur}\n")
        for i in range(1, 9):
            out.append(f"\n## {code}-{i} · {TOPIC[i-1].replace('<CUR>', cur)}\n")
            for l in langs:
                p = {x['id']: x for x in load(f"{ROOT}/data/c/{code}-{l}.json")}[str(i)]
                img = f"img/c/{code}-{l}/{i}.png"
                post = tagged(p['post'], l, code)
                out.append(f"**{LANGNAME[l]}** — `{img}`\n\n```\n{post}\n```\n")
                rows.append(dict(set="country", id=f"{code}-{i}", pillar=TOPIC[i-1],
                                 country=name, lang=l, image=img,
                                 headline=p['head'].replace("\n", " "), text=post))
    open(f"{ROOT}/posts-countries.md", "w").write("\n".join(out))

    json.dump(rows, open(f"{ROOT}/posts.json", "w"), ensure_ascii=False, indent=1)
    with open(f"{ROOT}/posts.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["set","id","pillar","country","lang",
                                          "image","headline","text"])
        w.writeheader(); w.writerows(rows)
    print(f"{len(rows)} posts exported")
    print("  global :", sum(1 for r in rows if r['set']=='global'))
    print("  country:", sum(1 for r in rows if r['set']=='country'))
    long = [r for r in rows if len(r['text']) > 280]
    print("  over 280 chars:", len(long) or "none",
          *(f"{r['id']}/{r['lang']} {len(r['text'])}" for r in long))

build()
