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
`python3 gen.py country <cc>:<lang> …` and `python3 export.py`.

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

All 426 posts are under 280 characters, so none of them need X Premium.
