# wallet-cli token add

Add a token to the address book (fetches symbol/decimals).

## Synopsis

```
wallet-cli token add (--contract <address> | --asset-id <id>) [options]
```

## Description

Fetches the token's symbol and decimals from the chain and adds it to the local token address book. The book is scoped to **network + account**: a token added on `tron:nile` for one account does not appear for other networks or accounts.

Once added, the token can be used by symbol elsewhere — e.g. `tx send --token USDT`. The book has two layers: **official** (bundled, read-only) and **user** (the ones you add). If the token is already bundled in the official layer, it fails with `token_already_listed` (no need to add it again); if you have already added it before, adding it again does not error — it re-fetches the token's metadata (symbol/decimals/name) and updates it, returning `action: refreshed`.

## Options

| Option | Description |
|---|---|
| `--contract <string>` | TRC20 contract address; exactly one of `--contract` / `--asset-id` |
| `--asset-id <string>` | TRC10 numeric asset id; exactly one of `--asset-id` / `--contract` |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```console
$ wallet-cli token add --contract TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf --network tron:nile
✅ Added to token book
  Name      Tether USD
  Symbol    USDT
  Decimals  6
```

```console
$ wallet-cli token add --contract TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf --network tron:nile -o json
{"schema":"wallet-cli.result.v1","success":true,"command":"tron.token.add","data":{"network":"tron:nile","account":"wlt_b2.0","action":"added","token":{"kind":"trc20","id":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","symbol":"USDT","decimals":6,"name":"Tether USD"}},"meta":{"durationMs":15,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `network` | string | Network the entry is scoped to |
| `account` | string | Account the entry is scoped to |
| `action` | string | `"added"` (first time) / `"refreshed"` (already in user layer, metadata refreshed) |
| `token.kind` | string | `trc20` / `trc10` |
| `token.id` | string | Contract address or asset id |
| `token.symbol` | string | Fetched symbol |
| `token.decimals` | number | Fetched decimals |
| `token.name` | string | Fetched name |

## Exit status

`0` added · `1` execution failure (`token_metadata_unavailable` — metadata could not be fetched, nothing is stored; `token_already_listed` — already in the official layer) · `2` usage error (`invalid_value`).

## See also

[`token list`](list.md) · [`token remove`](remove.md) · [`tx send`](../tx/send.md)
