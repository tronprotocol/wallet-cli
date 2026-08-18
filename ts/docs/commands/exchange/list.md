# wallet-cli exchange list

List every exchange pair on chain.

## Synopsis

```
wallet-cli exchange list [--limit <n>] [--offset <n>] [options]
```

## Description

Lists pairs with their id, both tokens, reserves, and creator. Read-only, no account needed. For one pair on its own, use [`exchange show`](show.md).

**`Pair` is in the order the chain stored it**, which is the order the creator supplied — TRX is not normalized to either side, so `1000124:TRX` and `TRX:1000123` both occur. The two numbers in `Reserves` follow that same order.

**Reserves here are in minimal units, not whole tokens.** This command makes a single RPC and so has no token precisions to divide by; `exchange show` fetches them and prints whole tokens instead. The same pair therefore reads `6,672` here and `66.72` there.

Paging happens on the node, and **there is no total**: the chain exposes no count of exchange pairs. The title reports the window it asked for — `Exchanges (limit 3, offset 0)` — not `showing 3 of N`, and `meta.pagination.total` is always `null`. To get everything, pass a `--limit` large enough to cover it.

## Options

| Option | Description |
|---|---|
| `--limit <number>` | Max pairs to return (default `10`) |
| `--offset <number>` | Pagination offset (default `0`) |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli exchange list --limit 3 --network tron:nile
```

```console
Exchanges (limit 3, offset 0)
| ID | Pair        | Reserves (minimal units)           | Creator           |
| -- | ----------- | ---------------------------------- | ----------------- |
| 14 | 1000124:TRX | 2,500,000,000,000 / 50,000,000,000 | TBeta9mR...8pLx   |
| 13 | 1000125:TRX | 16,000,000 / 8,000,000,000         | TAlpha7k...3nQw   |
| 12 | TRX:1000123 | 10,000,000,000 / 500,000,000,000   | TQkXm4vN...5Zt7Uw |
```

```bash
wallet-cli exchange list --limit 3 --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"exchange.list","data":{"kind":"exchange-list","exchanges":[{"exchangeId":14,"pair":"1000124:TRX","creatorAddress":"TBeta9mR...","firstTokenId":"1000124","firstTokenBalance":"2500000000000","secondTokenId":"_","secondTokenBalance":"50000000000"},{"exchangeId":13,"pair":"1000125:TRX","creatorAddress":"TAlpha7k...","firstTokenId":"1000125","firstTokenBalance":"16000000","secondTokenId":"_","secondTokenBalance":"8000000000"},{"exchangeId":12,"pair":"TRX:1000123","creatorAddress":"TQkXm4vN...","firstTokenId":"_","firstTokenBalance":"10000000000","secondTokenId":"1000123","secondTokenBalance":"500000000000"}]},"meta":{"durationMs":52,"warnings":[],"pagination":{"offset":0,"limit":3,"total":null}},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data.kind` is `exchange-list`. `data.exchanges[]` — one entry per pair:

| Field | Type | Meaning |
|---|---|---|
| `exchangeId` | number | Pair id |
| `pair` | string | The two sides as `tokenA:tokenB`, in stored order; TRX is spelled `TRX` here |
| `creatorAddress` | string | Creator, base58 |
| `firstTokenId` / `secondTokenId` | string | On-chain token ids, in stored order; TRX is `"_"` — it can be either side |
| `firstTokenBalance` / `secondTokenBalance` | string | Reserves, raw amounts in each token's smallest unit. **Strings**: reserves reach int64 and would lose precision as JSON numbers |

`meta.pagination` carries `offset`, `limit`, and `total` — `total` is always `null` here, meaning "no count exists", not "zero".

## Exit status

`0` success · `1` execution failure (`rpc_error`) · `2` usage error (`invalid_value` — bad limit or offset).

## See also

[`exchange show`](show.md) · [`exchange trade`](trade.md) · [`asset list`](../asset/list.md)
