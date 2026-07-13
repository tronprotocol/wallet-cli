# wallet-cli list

List wallets/accounts (no unlock needed).

## Synopsis

```
wallet-cli list [options]
```

## Description

Enumerates every locally stored account across all seed wallets and imports: HD accounts are grouped by seed, the rest by type (private key / watch-only / Ledger), marking the active one. Reads only metadata — the master password is not required.

## Options

Only the [global options](index.md#global-options-every-command).

## Examples

```console
$ wallet-cli list
HD  wlt_jj2vgz7m
├─ [0] main    TJxvjVUpQ2sVqW4WYN7iX96qWDLFoUU9NN  (active)
└─ [1] main-1  TJ4Pa3iF6ppS13RkeL8GHxNyaUfuyncqgS

private key
└─ hot         TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC

watch-only
└─ cold        TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH
```

HD accounts are grouped by seed and carry an `[index]`; non-HD entries (private key / watch-only / Ledger) are grouped by type and have no `[index]`.

```console
$ wallet-cli list -o json
{"schema":"wallet-cli.result.v1","success":true,"command":"list","data":[{"accountId":"wlt_jj2vgz7m.0","label":"main","type":"seed","index":0,"active":true,"addresses":{"tron":"TJxvjVUpQ2sVqW4WYN7iX96qWDLFoUU9NN"},"seedId":"wlt_jj2vgz7m"},{"accountId":"wlt_jj2vgz7m.1","label":"main-1","type":"seed","index":1,"active":false,"addresses":{"tron":"TJ4Pa3iF6ppS13RkeL8GHxNyaUfuyncqgS"},"seedId":"wlt_jj2vgz7m"},{"accountId":"wlt_w64e61jy","label":"hot","type":"privateKey","index":null,"active":false,"addresses":{"tron":"TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC"}},{"accountId":"wlt_bnd7sz5e","label":"cold","type":"watch","index":null,"active":false,"addresses":{"tron":"TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH"},"family":"tron"}],"meta":{"durationMs":13,"warnings":[]}}
```

## Output

`data` is an array; one entry per account:

| Field | Type | Meaning |
|---|---|---|
| `accountId` | string | Stable id; `<seedId>.<index>` for HD accounts, a standalone `wlt_…` for non-HD |
| `label` | string | Human label (rename with `rename`) |
| `type` | string | `seed` (HD), `privateKey`, `watch`, `ledger` |
| `index` | number \| null | HD derivation index within the seed; `null` for non-HD accounts |
| `active` | boolean | Whether this is the account commands default to |
| `addresses.tron` | string | Base58 TRON address |
| `seedId` | string | Owning seed wallet id (`seed` accounts only) |
| `family` | string | Chain family of the address, e.g. `tron` (`watch` accounts only) |

Local command — no `chain` block.

## Exit status

`0` · `2` usage error. See [machine-interface](../machine-interface.md#exit-codes).

## See also

`use` · `current` · [`create`](create.md) · [`account balance`](account/balance.md)
