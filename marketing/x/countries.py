#!/usr/bin/env python3
"""Country rollout: 8 posts per country, English master + local language.

Worked-example numbers are computed from one reference rate per country so the
arithmetic is internally consistent everywhere. Rates are illustrative and
should be refreshed against the live book before anything is scheduled.
"""
import json, os
ROOT = os.path.dirname(os.path.abspath(__file__))

# code, English name, coin, currency code, currency name (en), USD reference rate, local lang
COUNTRIES = [
 ("et","Ethiopia","aiETB","ETB","birr",     120.0,"am"),
 ("bt","Bhutan",   "aiBTN","BTN","ngultrum",  83.0,"en"),
 ("kg","Kyrgyzstan","KGST","KGS","som",       87.0,"ky"),
 ("ve","Venezuela","aiVES","VES","bolívar",   40.0,"es"),
 ("py","Paraguay", "aiPYG","PYG","guaraní", 7300.0,"es"),
 ("bd","Bangladesh","aiBDT","BDT","taka",    120.0,"bn"),
 ("pk","Pakistan", "aiPKR","PKR","rupee",    280.0,"ur"),
 ("eg","Egypt",    "aiEGP","EGP","pound",     48.0,"ar"),
 ("iq","Iraq",     "aiIQD","IQD","dinar",   1310.0,"ar"),
 ("ao","Angola",   "aiAOA","AOA","kwanza",   900.0,"pt"),
 ("cu","Cuba",     "aiCUP","CUP","peso",     320.0,"es"),
 ("ly","Libya",    "aiLYD","LYD","dinar",      4.8,"ar"),
 ("sd","Sudan",    "aiSDG","SDG","pound",    600.0,"ar"),
 ("ir","Iran",     "aiIRR","IRR","rial",   600000.0,"fa"),
]

def sig(x, n=4):
    """Round to n significant digits, printed without scientific notation."""
    from decimal import Decimal
    if x == 0: return "0"
    d = Decimal(repr(x))
    exp = d.adjusted()
    q = Decimal(1).scaleb(exp - n + 1)
    return format(d.quantize(q).normalize(), 'f')

def money(x, dp=0):
    return f"{x:,.{dp}f}"

def nice_size(target):
    """Round a size up to a clean number a trader would actually type."""
    import math
    mag = 10 ** math.floor(math.log10(target))
    for m in (1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10):
        if m * mag >= target:
            return m * mag
    return 10 * mag

def mono_for(c):
    """Language-neutral worked examples, computed from the reference rate."""
    code, name, coin, cur, curname, rate, lang = c
    px = 1.0 / rate                       # 1 ai<CUR> in USD
    ask, bid = px * 0.985, px * 1.013     # a crossed book, ~2.8% apart
    size = nice_size(2000 * rate)         # roughly a 2,000 USDT ticket
    net = size * (bid - ask)
    pct = (bid - ask) / ask * 100
    # payment-method legs, quoted in local currency
    lo, hi = rate * 0.992, rate * 1.016
    ldp = 2 if rate < 1000 else 0
    pnet = 1000 * (hi - lo)
    ppct = (hi - lo) / lo * 100
    return {
      "1": f"pair   {coin}-USDT-TRC20\npair   {coin}-KGST\n──────────────────\n1 {coin} \u2248 1 {cur}\nescrow on every trade",
      "2": f"USDT · BTC · KGST\nETH · SOL · {coin}\n──────────────────\nbank · card · mobile · cash",
      "3": (f"pair      {coin}-USDT-TRC20\nbest ask  {sig(ask)}\nbest bid  {sig(bid)}\n"
            f"──────────────────\nsize  {money(size)} {coin}\nnet   +{money(net,2)} USDT  ({pct:.1f}%)"),
      "4": "01  you pick an order\n02  escrow locks the asset\n03  you pay the maker\n04  escrow releases",
      "5": "01  share your link\n02  they trade\n03  you earn",
      "6": f"GPU   \u2192  AI jobs\njobs  \u2192  {coin}\n{coin} \u2192  P2P  \u2192  {cur}",
      "7": "you  \u21c4  maker\n──────────────────\nno broker\nno correspondent bank\nno wire to explain",
      "8": (f"asset  USDT-TRC20, in {cur}\nbuy   via cash    {money(lo,ldp)}\nsell  via bank    {money(hi,ldp)}\n"
            f"──────────────────\nsize  1,000 USDT\nnet   +{money(pnet,ldp)} {cur}  ({ppct:.1f}%)"),
    }

VARIANT = {"1":"stat","2":"stat","3":"stat","4":"stat","5":"stat","6":"stat","7":"stat","8":"stat"}

if __name__ == "__main__":
    os.makedirs(os.path.join(ROOT,'data','c'), exist_ok=True)
    for c in COUNTRIES:
        m = mono_for(c)
        spec = [{"id":str(i),"v":VARIANT[str(i)],"mono":m[str(i)]} for i in range(1,9)]
        json.dump(spec, open(os.path.join(ROOT,'data','c','spec-%s.json'%c[0]),'w'),
                  ensure_ascii=False, indent=1)
    print("specs for", len(COUNTRIES), "countries")
    for c in COUNTRIES[:2] + COUNTRIES[-1:]:
        print('\n==', c[1], '==')
        print(mono_for(c)["3"]); print(mono_for(c)["8"])
