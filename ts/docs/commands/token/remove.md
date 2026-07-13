# wallet-cli token remove

Remove a user-added token from the address book.

## Synopsis

```
wallet-cli token remove (--contract <address> | --asset-id <id>) [options]
```

## Description

Removes a token you added from the user layer of the address book (same network + account scope as [`token add`](add.md)). Official-layer tokens cannot be removed — trying returns `token_is_official`.

Purely local — the token and your balance on-chain are unaffected; only the local symbol mapping goes away.

## Options

| Option | Description |
|---|---|
| `--contract <string>` | TRC20 contract address to remove; exactly one of `--contract` / `--asset-id` |
| `--asset-id <string>` | TRC10 numeric asset id to remove; exactly one of `--asset-id` / `--contract` |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```console
$ wallet-cli token remove --contract TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf --network tron:nile
✅ Removed from token book
  Name    Tether USD
  Symbol  USDT
```

```console
$ wallet-cli token remove --contract TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf --network tron:nile -o json
{"schema":"wallet-cli.result.v1","success":true,"command":"tron.token.remove","data":{"network":"tron:nile","account":"wlt_b2.0","removed":{"kind":"trc20","id":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","symbol":"USDT","decimals":6,"name":"Tether USD"}},"meta":{"durationMs":15,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `network` | string | Network the entry was scoped to |
| `account` | string | Account the entry was scoped to |
| `removed` | object | The deleted token entry (`kind`, `id`, `symbol`, `decimals`, `name`) |

## Exit status

`0` removed · `1` execution failure (`token_is_official` — official-layer tokens can't be removed; `token_not_in_book` — not in the book) · `2` usage error (`invalid_value`).

## See also

[`token add`](add.md) · [`token list`](list.md)
