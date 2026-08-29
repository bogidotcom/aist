# AIST Exchange

Web P2P market for compute coins. Talks only to the endpoints in
`../todo/P2P-API-FOR-AIST.md`.

```
/                 home — assets, compute payout, arbitrage, P2P liquidity
/market           all pairs, last, 24h (null until a sampler)
/strategies       arbitrage tutorials (static, no API calls)
/exchange?pair=   chart (coming) + book + pay ticket
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
off the web root. nginx routes `/`, `/market`, `/exchange` and `/strategies`;
a new page needs a matching `location =` block in `/etc/nginx/sites-available/aist.exchange`.

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

## Not in v1

GELt as a listed quote, matching engine.
