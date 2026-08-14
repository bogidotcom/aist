# aist.exchange

Web P2P market for compute coins. Talks only to the endpoints in
`../todo/P2P-API-FOR-AIST.md`.

```
/                 home
/market           all pairs, last, 24h (null until a sampler)
/exchange?pair=   chart (coming) + book + pay ticket
```

Pair slug is `BASE-QUOTE` with **wire** tickers. Quotes can contain hyphens:

| pair | meaning |
|---|---|
| `KGST-USDT-TRC20` | KGST quoted in Tron USDT |
| `KGST-USDT-ERC20` | KGST quoted in Ethereum USDT |
| `aiGEL-KGST` | αιGEL quoted in KGST (on-chain, sell-side) |
| `POH-USDT-TRC20` | POH quoted in Tron USDT |

Do not `split('-')[0]`.

## Run

```bash
cd /home/bo/Desktop/poh/dev/exchange
node serve.mjs
# http://127.0.0.1:8788
```

Default API: `http://127.0.0.1:3456` on localhost, otherwise `https://miner.poh.ge`.
Change it with the gear control or `?api=http://127.0.0.1:3456`.

Live miner may lack `/markets`. The UI then builds pairs from `/currencies`.
Any legacy `aiKGS` from an old node is rewritten to **KGST** and never shown.

## Wallets

Connect modal: EVM (MetaMask), TronLink, Phantom, TON (address / manual).

- **You give** USDT-ERC20 / BEP20 / ETH → MetaMask `eth_sendTransaction` (USDT via `transfer`).
- **You give** USDT-TRC20 → TronLink contract `transfer`.
- Solana / TON: connect for receive-address autofill; send is copy-paste (no SPL/TON SDK in this tree).
- Any asset: copy the maker `paymentMethods[].address` and transfer manually.

Escrow lock (`POST /select`) needs a POH miner wallet already known on the node.
This UI pays the listed address; finish the 15-minute escrow in the PoH wallet.

## Chart

`GET /api/p2p/candles?pair=&interval=1m|1h|1d`. Empty until the node has sampled a book (every 60s).

## Not in v1

GELt as a listed quote, matching engine.
