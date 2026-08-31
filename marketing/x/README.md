# AIST — X campaign

426 posts, each with a 16:9 card sized for feed legibility (1600×900 PNG).

```
posts-global.md      30 posts × 7 languages   review copy
posts-countries.md   14 countries × 8 posts   review copy
posts.json           everything, machine-readable
posts.csv            same, for Buffer / Typefully / Hypefury
img/<lang>/NN.png    global cards
img/c/<cc>-<lang>/N.png   country cards
```

Regenerate: `python3 countries.py && python3 gen.py <langs>` then
`python3 gen.py country <cc>:<lang> …`, `python3 export.py` and `python3 plan.py`.

## The plan page

`plan.py` builds a single page with every post laid out next to its card, a copy
button on each one, a language filter and a search box.

| File | What it is |
|---|---|
| [`index.html`](index.html) | The plan, opened straight off disk — images come from `img/`. `xdg-open index.html` |
| `web.html` | The same page, self-contained: every card inlined as a small WebP, ~3.8 MB, one file to send or host |
| `build/artifact.html` | The body of `web.html` without the `<html>` skeleton — what gets published |

Published copy, readable in a browser (and by the Claude Chrome extension):
**<https://claude.ai/code/artifact/8d736b0b-c557-4972-ac12-4ee91336b26f>**

```bash
python3 plan.py            # index.html + web.html + build/artifact.html
python3 plan.py --local    # index.html only, skips the thumbnail pass
```

Thumbnails are cached in `build/thumbs/`, so a rebuild after a copy edit is
instant; only cards whose PNG actually changed are re-encoded. Republish by
handing `build/artifact.html` back to the Artifact tool with that URL.

## Hashtags

Every post ends with `#p2p`. A post that is actually going out also carries the
countries it targets — the global set tags every campaign country that speaks its
language, a country post tags its own country:

```
es → #Venezuela #Paraguay #Cuba      ur → #Pakistan
ar → #Egypt #Iraq #Libya #Sudan      bn → #Bangladesh
pt → #Angola                         am → #Ethiopia
fa → #Iran                           ky → #Kyrgyzstan
```

English is review copy and carries `#p2p` alone — both the global English set and
the fourteen English country masters. Bhutan is the exception: English is the
language it posts in, so its set carries `#p2p #Bhutan`.

Arabic, Persian and Urdu posts carry a left-to-right mark (U+200E) in front of
the tag line. Without it the leading `#` is a neutral at the start of an RTL
line, so bidi paints it at the far end and `#p2p #Egypt #Iraq #Libya #Sudan`
reads as `p2p #Egypt #Iraq #Libya #Sudan#` — on the page and in the tweet. The
mark is invisible and costs one character.

The tags are appended in `export.py` (`tags()` / `tagged()`), so they land in
`posts.json`, `posts.csv` and the two markdown files but never on the rendered
cards. Change the rule there and re-run `python3 export.py && python3 plan.py`.

## Global set — 30 posts

Built from the new landing page and `/strategies`. Six pillars:

| Posts | Pillar |
|---|---|
| 01–03 | Launch |
| 04–11 | The eight strategies, one post each |
| 12–18 | Rules and risk (round trip, escrow window, depth, float, adverse selection, idle float, leg three) |
| 19–23 | Assets and rails (USDT ×5, BTC, KGST, fiat, ETH/SOL) |
| 24–27 | Compute payout for miners |
| 28–30 | P2P liquidity |

Languages: English, Spanish, Portuguese, Arabic, Persian, Urdu, Bengali.

## Country set — 14 countries × 8 posts

Same eight topics everywhere: coin listing, trade on P2P, simple spread
arbitrage, what P2P is, referrals, local AI community, why P2P, payment-method
arbitrage.

Each country ships an **English master** (for review) and the **local
language** (for posting):

| Country | Coin | Local language | Coin live today? |
|---|---|---|---|
| Ethiopia | aiETB | Amharic | **yes** |
| Bhutan | aiBTN | English | **yes** |
| Kyrgyzstan | KGST | Kyrgyz | **yes** |
| Venezuela | aiVES | Spanish | no |
| Paraguay | aiPYG | Spanish | no |
| Bangladesh | aiBDT | Bengali | no |
| Pakistan | aiPKR | Urdu | no |
| Egypt | aiEGP | Arabic | no |
| Iraq | aiIQD | Arabic | no |
| Angola | aiAOA | Portuguese | no |
| Cuba | aiCUP | Spanish | no |
| Libya | aiLYD | Arabic | no |
| Sudan | aiSDG | Arabic | no |
| Iran | aiIRR | Persian | no |

## Read before scheduling

**Eleven of the fourteen coins do not exist yet.** `js/api.js` knows only
`KGST`, `aiGEL`, `aiETB` and `aiBTN`. Post 1 of every country set announces
`ai<CUR>` as live — true today only for Ethiopia, Bhutan and Kyrgyzstan. The
other eleven sets are written and rendered ready to go, but must not be
published until those coins actually list, or they are a false claim.

**The referral posts carry no commission rate.** Nothing in the repo defines a
referral programme, so the copy says what happens ("share your link, they
trade, you earn") without inventing a number. Insert the real terms before
posting, in the copy and in `mono_for()["5"]` in `countries.py`.

**FX reference rates are illustrative.** `COUNTRIES` in `countries.py` carries
one USD rate per country; every worked example is computed from it, so the
arithmetic is internally consistent but the levels drift. Refresh the rates and
re-run before a launch. The same applies to the global set's prices, which are
the ones already published on `/strategies`.

**Iran uses the rial (IRR).** Iranian traders usually quote toman (1 toman =
10 rial). If the coin lists as `aiIRT`, regenerate the Iran set.

**Bhutan is English only.** English is an official working language there;
there is no Dzongkha set.

## Card design

Dark AIST brand card: gold kicker, oversized Sora headline, and a mono block
holding the worked example. Headline type is sized to the longest line so
nothing re-wraps or shrinks below feed legibility.

Numbers are never translated — tickers, sizes and prices read the same in every
locale, which is the same rule the `/strategies` page follows. RTL languages
(Arabic, Persian, Urdu) mirror the whole card; the mono block stays LTR.

Fonts: Sora / DM Sans / IBM Plex Mono for Latin, Noto Sans Arabic (Arabic,
Persian), Noto Nastaliq Urdu, Noto Sans Bengali, Noto Sans Ethiopic, Noto Sans
for Kyrgyz Cyrillic.

All 426 posts are under 280 characters with their hashtags included, so none of
them need X Premium. `export.py` prints anything that crosses the limit.
