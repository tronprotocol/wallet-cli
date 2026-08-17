# wallet-cli exchange show

Show one exchange pair.

## Synopsis

```
wallet-cli exchange show <id> [options]
```

## Description

Reports a pair's creator, creation time, and both tokens with their reserves. Read-only, no account needed.

**No price is shown.** The ratio of the reserves is a quoted rate that holds only in the limit of a zero-size trade; anything with volume settles further along the curve and returns less. Printing it would invite reading it as an executable price. To price a specific amount against the current reserves, run [`exchange trade --dry-run`](trade.md).

Unlike [`exchange list`](list.md), this command resolves each side's name and precision, so **reserves print as whole tokens here** and the json carries `firstTokenLabel` / `firstTokenDecimals` and their `second*` counterparts alongside the raw balances. The same pair therefore reads `66.72` here and `6,672` in the list.

`pair` and the `first*` / `second*` fields follow the order the chain stored them, which is the order the creator supplied — TRX is not normalized to either side. Text folds the two sides into a `Reserves` block in that same order.

## Options

| Option | Description |
|---|---|
| `<id>` | **Required.** Exchange pair id |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli exchange show 12 --network tron:nile
```

```console
Exchange id 12
  Creator       TQkXm4vN...5Zt7Uw
  Created time  2026-08-02 09:15:00 UTC
  Reserves
    TRX                   10,000
    MyToken (id 1000123)  500,000
```

```bash
wallet-cli exchange show 12 --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"exchange.show","data":{"kind":"exchange-show","exchangeId":12,"pair":"TRX:1000123","creatorAddress":"TQkXm4vN...","createTime":1785662100000,"firstTokenId":"_","firstTokenBalance":"10000000000","firstTokenLabel":"TRX","firstTokenDecimals":6,"secondTokenId":"1000123","secondTokenBalance":"500000000000","secondTokenLabel":"MyToken","secondTokenDecimals":6},"meta":{"durationMs":24,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data.kind` is `exchange-show`.

| Field | Type | Meaning |
|---|---|---|
| `exchangeId` | number | Pair id |
| `pair` | string | The two sides as `tokenA:tokenB`, in stored order; TRX is spelled `TRX` here |
| `creatorAddress` | string | Creator, base58 — the only account that may inject or withdraw |
| `createTime` | number | Creation time, ms since epoch |
| `firstTokenId` / `secondTokenId` | string | On-chain token ids, in stored order; TRX is `"_"` — it can be either side |
| `firstTokenBalance` / `secondTokenBalance` | string | Reserves, raw amounts in each token's smallest unit. **Strings**: reserves reach int64 and would lose precision as JSON numbers |
| `firstTokenLabel` / `secondTokenLabel` | string | Token name, or `TRX` |
| `firstTokenDecimals` / `secondTokenDecimals` | number | Decimal places used to render the whole-token figures in text |

## Exit status

`0` success · `1` execution failure (`exchange_not_found` — no such pair, `rpc_error`) · `2` usage error (`invalid_value` — id not a number).

## See also

[`exchange list`](list.md) · [`exchange trade`](trade.md) · [`exchange inject`](inject.md)
