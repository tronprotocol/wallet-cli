# wallet-cli asset list

List every TRC10 on chain.

## Synopsis

```
wallet-cli asset list [--limit <n>] [--offset <n>] [options]
```

## Description

Lists TRC10 tokens with id, name, total supply, precision, and issuer. Read-only, no account needed. For one token's full issuance record — ICO rate and window, frozen tranches — use [`asset info`](info.md).

Paging happens on the node, and **there is no total**: the chain exposes no count of TRC10 tokens, and fetching them all to count them is expensive (thousands of tokens, megabytes of response). So the title reports the window it asked for — `Assets (limit 3, offset 0)` — not `showing 3 of N`, and `meta.pagination.total` is always `null`. To get everything, pass a `--limit` large enough to cover it.

## Options

| Option | Description |
|---|---|
| `--limit <number>` | Max tokens to return (default `10`) |
| `--offset <number>` | Pagination offset (default `0`) |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli asset list --limit 3 --network tron:nile
```

```console
Assets (limit 3, offset 0)
| ID      | Name      | Total supply  | Precision | Issuer            |
| ------- | --------- | ------------- | --------- | ----------------- |
| 1000125 | AlphaCoin | 500,000,000   | 2         | TAlpha7k...3nQw   |
| 1000124 | BetaToken | 2,000,000,000 | 6         | TBeta9mR...8pLx   |
| 1000123 | MyToken   | 1,000,000,000 | 6         | TQkXm4vN...5Zt7Uw |
```

```bash
wallet-cli asset list --limit 3 --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"asset.list","data":{"kind":"asset-list","assets":[{"assetId":"1000125","name":"AlphaCoin","issuerAddress":"TAlpha7k...","totalSupply":"50000000000","precision":2},{"assetId":"1000124","name":"BetaToken","issuerAddress":"TBeta9mR...","totalSupply":"2000000000000000","precision":6},{"assetId":"1000123","name":"MyToken","issuerAddress":"TQkXm4vN...","totalSupply":"1000000000000000","precision":6}]},"meta":{"durationMs":48,"warnings":[],"pagination":{"offset":0,"limit":3,"total":null}},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data.kind` is `asset-list`. `data.assets[]` — one entry per token:

| Field | Type | Meaning |
|---|---|---|
| `assetId` | string | Token id |
| `name` | string | Token name |
| `issuerAddress` | string | Issuer, base58 |
| `totalSupply` | string | Total supply, raw (whole tokens × 10^`precision`). A **string**: supplies reach int64 and would lose precision as a JSON number |
| `precision` | number | Decimal places, 0–6 |

`meta.pagination` carries `offset`, `limit`, and `total` — `total` is always `null` here, meaning "no count exists", not "zero".

## Exit status

`0` success · `1` execution failure (`rpc_error`) · `2` usage error (`invalid_value` — bad limit or offset).

## See also

[`asset info`](info.md) · [`token list`](../token/list.md)
