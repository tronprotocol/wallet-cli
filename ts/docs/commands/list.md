# wallet-cli list

List wallets/accounts (no unlock needed).

## Synopsis

```
wallet-cli list [options]
```

## Description

Enumerates every locally stored account across all seed wallets and imports, grouped by seed, marking the active one. Reads only metadata — the master password is not required.

## Options

Only the [global options](index.md#global-options-every-command).

## Examples

```console
$ wallet-cli list
HD  wlt_4473p34m
├─ [0] main        TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ  (active)
├─ [1] sub-1       TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH
└─ [2] op-derived  TUGFiVQB7uTWVyiKzLCJrdukJhMGaDnxND

HD  wlt_tpnqc4hs
└─ [0] imp-mn      TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6
```

```console
$ wallet-cli list -o json
{"schema":"wallet-cli.result.v1","success":true,"command":"list","data":[{"accountId":"wlt_4473p34m.0","label":"main","type":"seed","index":0,"active":true,"addresses":{"tron":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ"},"seedId":"wlt_4473p34m"},…],"meta":{"durationMs":16,"warnings":[]}}
```

## Output

`data` is an array; one entry per account:

| Field | Type | Meaning |
|---|---|---|
| `accountId` | string | Stable id `<seedId>.<index>` |
| `label` | string | Human label (rename with `rename`) |
| `type` | string | `seed` for HD-derived; imports/watch entries have their own types |
| `index` | number | HD derivation index within the seed |
| `active` | boolean | Whether this is the account commands default to |
| `addresses.tron` | string | Base58 TRON address |
| `seedId` | string | Owning seed wallet id |

Local command — no `chain` block.

## Exit status

`0` · `2` usage error. See [machine-interface](../machine-interface.md#exit-codes).

## See also

`use` · `current` · [`create`](create.md) · [`account balance`](account/balance.md)
