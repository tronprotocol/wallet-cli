# wallet-cli token list

List the token address book (official + user).

## Synopsis

```
wallet-cli token list [options]
```

## Description

Lists every token visible to the active account (or `--account`) on the selected network: the bundled **official** layer plus your **user** additions. The `source` column tells them apart. These are the symbols `tx send --token <symbol>` resolves against. Read-only, local + metadata only — no password.

## Options

No command-specific options; the [global options](../index.md#global-options-every-command) only (`--network` / `--account` set the book's scope).

## Examples

```console
$ wallet-cli token list --network tron:nile
Symbol  Name        Source    Contract / ID
USDT    Tether USD  official  TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf
SUN     SunToken    user      TSSMHYeV2uE9qYH95DqyoCuNCzEL1NUU3S
```

```console
$ wallet-cli token list --network tron:nile -o json
{"schema":"wallet-cli.result.v1","success":true,"command":"tron.token.list","data":{"network":"tron:nile","account":"wlt_b2.0","tokens":[{"kind":"trc20","id":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","symbol":"USDT","decimals":6,"name":"Tether USD","source":"official"},{"kind":"trc20","id":"TSSMHYeV2uE9qYH95DqyoCuNCzEL1NUU3S","symbol":"SUN","decimals":18,"name":"SunToken","source":"user"}]},"meta":{"durationMs":15,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data`: `network`, `account`, and `tokens[]` — one entry per token:

| Field | Type | Meaning |
|---|---|---|
| `kind` | string | `trc20` / `trc10` |
| `id` | string | Contract address or asset id |
| `symbol` | string | Token symbol (used by `tx send --token`) |
| `decimals` | number | Token decimals |
| `name` | string | Token name |
| `source` | string | `official` (bundled) / `user` (added by you) |

## Exit status

`0` success · `1` execution failure · `2` usage error.

## See also

[`token add`](add.md) · [`token remove`](remove.md) · [Sending tokens](../../guide/send-tokens.md)
