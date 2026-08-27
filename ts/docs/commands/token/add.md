# wallet-cli token add

Add a token to the address book, fetching its metadata from the chain.

## Synopsis

```
wallet-cli token add (--contract <address> | --asset-id <id>) [options]
```

## Description

Fetches the token's name, symbol and decimals from the contract and adds it to the local token address book. Works on both TRON (TRC20/TRC10) and EVM (ERC20) networks. The book is scoped to **network + account**: a token added on `tron:nile` for one account does not appear for other networks or accounts.

Once added, the token can be used by symbol elsewhere — e.g. `tx send --token USDT`. The book has two layers: **official** (bundled, read-only) and **user** (the ones you add). If the token is already bundled in the official layer, it fails with `token_already_listed` (no need to add it again); if you have already added it before, adding it again does not error — it re-fetches the token's metadata (symbol/decimals/name) and updates it, returning `action: refreshed`.

## Options

| Option | Description |
|---|---|
| `--contract <string>` | Token contract address — TRC20 on TRON, ERC20 on EVM |
| `--asset-id <string>` | **TRON only.** TRC10 numeric asset id; exactly one of `--asset-id` / `--contract` |

Plus the [global options](../index.md#global-options-every-command).

`--asset-id` is a TRON-only flag: help tags it `(tron only)`, and passing it on an EVM network fails with `invalid_option` before any node call.

## Examples

```bash
wallet-cli token add --contract TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf --network tron:nile
```

```console
✅ Added to token book
  Name      Tether USD
  Symbol    USDT
  Decimals  6
```

```bash
wallet-cli token add --contract TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"token.add","data":{"network":"tron:nile","account":"wlt_b2.0","action":"added","token":{"kind":"trc20","id":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","symbol":"USDT","decimals":6,"name":"Tether USD"}},"meta":{"durationMs":15,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

An ERC20 token on an EVM network, where `token.kind` is `erc20`:

```bash
wallet-cli token add --contract 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238 --network evm:11155111
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `network` | string | Network the entry is scoped to |
| `account` | string | Account the entry is scoped to |
| `action` | string | `"added"` (first time) / `"refreshed"` (already in user layer, metadata refreshed) |
| `token.kind` | string | `trc20` / `trc10` (TRON) or `erc20` (EVM) |
| `token.id` | string | Contract address, or TRC10 asset id |
| `token.symbol` | string | Fetched symbol |
| `token.decimals` | number | Fetched decimals |
| `token.name` | string | Fetched name |

## Exit status

`0` added · `1` execution failure (`token_metadata_unavailable` — metadata could not be fetched, nothing is stored; `token_already_listed` — already in the official layer) · `2` usage error (`invalid_value`; `invalid_option` — `--asset-id` on an EVM network).

## See also

[`token list`](list.md) · [`token remove`](remove.md) · [`tx send`](../tx/send.md)
