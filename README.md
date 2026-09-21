# AIST Exchange

Web P2P market for compute coins. Talks only to the endpoints in
`../todo/P2P-API-FOR-AIST.md`.

```
/                 home — assets, compute payout, arbitrage, P2P liquidity
/market           all pairs, last, 24h (null until a sampler)
/strategies       arbitrage tutorials (static, no API calls)
/exchange?pair=   chart (coming) + book + pay ticket
/blog/            long-form posts (static, no API calls)
```

Pair slug is `BASE-QUOTE` with **wire** tickers. Quotes can contain hyphens:

| pair | meaning |
|---|---|
| `KGST-USDT-TRC20` | KGST quoted in Tron USDT |
| `KGST-USDT-ERC20` | KGST quoted in Ethereum USDT |
| `aiGEL-KGST` | αιGEL quoted in KGST (on-chain, sell-side) |
| `DAI-USDT-TRC20` | DAI quoted in Tron USDT |

Do not `split('-')[0]`.

## Run

```bash
cd /home/bo/Desktop/poh/dev/exchange
node serve.mjs
# http://127.0.0.1:8788
```

## Deploy

```bash
rsync -av --delete --exclude-from=.rsync-exclude ./ root@203.18.98.51:/var/www/aist/
```

Live at **https://aist.exchange** (Let's Encrypt, auto-renewing, HTTP/2, HTTP→HTTPS
redirect). It is also the `default_server`, so an unmatched Host lands there.
The `assetux.com` / `p2p.assetux.com` config was removed on 2026-08-29; a copy
is at `/root/nginx-assetux-removed-*.conf` on the server.

The dotfile deny below sits alongside an ACME exemption — `.well-known` starts
with a dot, so without `location ^~ /.well-known/acme-challenge/` certbot
renewal fails.

`marketing/` holds campaign assets, not site files — `.rsync-exclude` keeps it
off the web root. `/market`, `/exchange` and `/strategies` are pseudo-routes —
each maps to a differently-named file (`market.html`, etc.) — so a new one of
those needs a matching `location =` block in
`/etc/nginx/sites-available/aist.exchange`. `/blog/` needed no such block: it
is a real directory with a real `index.html` inside it, so the generic
`location / { try_files $uri $uri/ /index.html; }` already serves it —
`/blog`, `/blog/`, `/blog/<post>.html` and the two `i18n.blog*.js` files all
resolve through the catch-all.

**`.rsync-exclude` does not clean the server.** An excluded path is protected
from `--delete` as well as from upload, so anything already on the server under
one of those names stays there. That is how a `.git` from the original deploy
clone sat in the web root serving the whole history to scanners until
2026-08-29. nginx now refuses every dotfile:

```nginx
location ~ /\. { deny all; access_log off; log_not_found off; return 404; }
```

Present in both TLS server blocks. Keep it there, and check `ls -a` on the web
root after any deploy that changes the exclude list.

Default API: `http://127.0.0.1:3456` on localhost, otherwise `https://miner.iamai.kg`.
Change it with the gear control or `?api=http://127.0.0.1:3456`.

Live miner may lack `/markets`. The UI then builds pairs from `/currencies`.
Any legacy `aiKGS` from an old node is rewritten to **KGST** and never shown.

## Wallets

Connect modal: EVM (MetaMask), TronLink, Phantom, TON (address / manual).

- **You give** USDT-ERC20 / BEP20 / ETH → MetaMask `eth_sendTransaction` (USDT via `transfer`).
- **You give** USDT-TRC20 → TronLink contract `transfer`.
- Solana / TON: connect for receive-address autofill; send is copy-paste (no SPL/TON SDK in this tree).
- Any asset: copy the maker `paymentMethods[].address` and transfer manually.

Escrow lock (`POST /select`) needs a DAI miner wallet already known on the node.
This UI pays the listed address; finish the 15-minute escrow in the DAI wallet.

## Chart

`GET /api/p2p/candles?pair=&interval=1m|1h|1d`. Empty until the node has sampled a book (every 60s).

## Strategies page

Static tutorials, eight cards, no node calls. Copy lives in
`js/i18n.strategies.js` (en / ru / ky / cn); the card order, difficulty level
and the worked-example blocks live in `js/strategies.js`.

Worked examples are deliberately **not** translated — they are tickers, sizes
and prices, which read the same in every locale. Only the labels around them
go through i18n.

Cards re-render on the `aist:lang` window event, which `AistUI.setLang` fires.

## Blog

Static long-form posts, no node calls, listed at `/blog/`. Each post is its
own HTML file with the English copy written directly into the markup (so it
reads correctly with JS off and is what search crawlers see); translations
for the other nine site languages live in `blog/i18n.blog.js` (ru / ky / cn)
and `blog/i18n.blog.more.js` (es / pt / ar / fa / ur / bn), merged into the
same `window.AIST_I18N` object the rest of the site uses.

`AistUI.apply()` only overwrites an element's `data-i18n[-html]` content when
a translation for it actually exists (`known()` in `js/ui.js`) — English has
no entries of its own in these blog packs, so switching to `en` just leaves
the inline markup alone instead of stamping the key name over it. A new post
needs entries for every key in **all nine** non-English languages, or it
half-translates depending on which language the visitor has selected.

The nav/footer "Blog" link and page-chrome routing live in `js/ui.js`
(`here()`, `href()`, `root()`) — `root()` is what lets pages one directory
down (`blog/*.html`) resolve `assets/`, `market`, etc. back through `../`.

## Not in v1

GELt as a listed quote, matching engine.
