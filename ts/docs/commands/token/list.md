# wallet-cli token list

List the token address book (official + user).

## Synopsis

```
wallet-cli token list [options]
```

## Description

Lists every token visible to the active account (or `--account`) on the selected network: the bundled **official** layer plus your **user** additions. The `source` column tells them apart. These are the symbols `tx send --token <symbol>` resolves against. Read-only and purely local — no password, and no node is contacted.

The book is per network, so the same command lists different tokens on `tron:nile` and `evm:11155111`.

## Options

No command-specific options; the [global options](../index.md#global-options-every-command) only (`--network` / `--account` set the book's scope).

## Examples

```bash
wallet-cli token list --network tron:nile
```

```console
| Symbol | Name            | Source   | Contract / ID                      |
| ------ | --------------- | -------- | ---------------------------------- |
| USDT   | Tether USD      | official | TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf |
| USDD   | Usdd Stablecoin | official | TYQF9cAeJ3Faq8QXpHxTcFco72DRCQbgFt |
```

> The `official` layer is bundled per network, and not every network has one. A network with no bundled entries lists only what you added with `token add` — an empty table until then:
>
> ```console
> | Symbol | Name | Source | Contract / ID |
> | ------ | ---- | ------ | ------------- |
> ```

```bash
wallet-cli token list --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"token.list","data":{"network":"tron:nile","account":"wlt_n5v4r992","tokens":[{"kind":"trc20","id":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","symbol":"USDT","decimals":6,"name":"Tether USD","source":"official"},{"kind":"trc20","id":"TYQF9cAeJ3Faq8QXpHxTcFco72DRCQbgFt","symbol":"USDD","decimals":18,"name":"Usdd Stablecoin","source":"official"}]},"meta":{"durationMs":15,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
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
