# wallet-cli token list

List the token address book (official + user).

## Synopsis

```
wallet-cli token list [options]
```

## Description

Lists every token visible to the active account (or `--account`) on the selected network: the bundled **official** layer plus your **user** additions. The `source` column tells them apart. These are the symbols `tx send --token <symbol>` resolves against. Read-only, local + metadata only — no password.

The book is per network, so the same command lists different tokens on `tron:3448148188` and `eip155:11155111`.

## Options

No command-specific options; the [global options](../index.md#global-options-every-command) only (`--network` / `--account` set the book's scope).

## Examples

```bash
wallet-cli token list --network nile
```

```console
| Symbol | Name            | Source   | Contract / ID                      |
| ------ | --------------- | -------- | ---------------------------------- |
| USDT   | Tether USD      | official | TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf |
| USDD   | Usdd Stablecoin | official | TYQF9cAeJ3Faq8QXpHxTcFco72DRCQbgFt |
```

> The `official` layer is bundled **per network**, and not every network has one: `tron:728126428` ships USDT / USDC / USDD, `tron:3448148188` ships USDT / USDD, and `eip155:1` ships USDT / USDC. The other networks ship none, so everything they list is a `user` entry you added with `token add`. An official entry is never copied between chains — the same symbol can have a different address and different decimals elsewhere (USDT is 6 decimals on Ethereum and 18 on BNB Smart Chain).

```bash
wallet-cli token list --network nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"token.list","data":{"network":"tron:3448148188","account":"wlt_b2.0","tokens":[{"kind":"trc20","id":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","symbol":"USDT","decimals":6,"name":"Tether USD","source":"official"},{"kind":"trc20","id":"TYQF9cAeJ3Faq8QXpHxTcFco72DRCQbgFt","symbol":"USDD","decimals":18,"name":"Usdd Stablecoin","source":"official"}]},"meta":{"durationMs":13,"warnings":[]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

## Output

`data`: `network`, `account`, and `tokens[]` — one entry per token:

| Field | Type | Meaning |
|---|---|---|
| `kind` | string | `trc20` / `trc10` (TRON) or `erc20` (EVM) |
| `id` | string | Contract address, or TRC10 asset id |
| `symbol` | string | Token symbol (used by `tx send --token`) |
| `decimals` | number | Token decimals |
| `name` | string | Token name |
| `source` | string | `official` (bundled) / `user` (added by you) |

## Exit status

`0` success · `1` execution failure · `2` usage error.

## See also

[`token add`](add.md) · [`token remove`](remove.md) · [Sending tokens](../../guide/send-tokens.md)
