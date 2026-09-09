# wallet-cli use

Set the active account.

## Synopsis

```
wallet-cli use <account> [options]
```

## Arguments

- `account` — accountId, label, or address to make active

## Options

[Global options](index.md) only.

## Examples

```bash
wallet-cli use main-1
```

```console
✅ Active account: main-1
  TRON address  TKpmAZmDcGhJBugwAhbJ1ubWeTM4VZgRbK
  EVM address   0x7Fee0863cB70a3C7c937A292220dD0C52E2526e0
```

You can also select by accountId or address: `wallet-cli use wlt_vy5n6qhh.1` / `wallet-cli use TKpmAZ…`.

```bash
wallet-cli use main-1 -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"use","data":{"previous":"wlt_vy5n6qhh.0","accountId":"wlt_vy5n6qhh.1","label":"main-1","type":"seed","index":1,"active":true,"addresses":{"tron":"TKpmAZmDcGhJBugwAhbJ1ubWeTM4VZgRbK","evm":"0x7Fee0863cB70a3C7c937A292220dD0C52E2526e0"},"seedId":"wlt_vy5n6qhh","derivationPath":null},"meta":{"durationMs":25,"warnings":[]}}
```

## Output

`data` is the account switched to, plus `previous` (the account that was active before). Local command — no `chain` block.

| Field | Type | Meaning |
|---|---|---|
| `previous` | string | Account id that was active before |
| `accountId` | string | Now-active account id |
| `label` | string | Account label |
| `type` | string | `seed` / `privateKey` / `watch` / `ledger` |
| `index` | number \| null | HD derivation index; `null` for non-HD accounts |
| `active` | boolean | Always `true` (just made active) |
| `addresses` | object | One entry per family the account can produce: `tron` (base58) and/or `evm` (`0x`, EIP-55 checksummed) |
| `derivationPath` | null | Always `null`; `use` selects an account but does not unlock the seed or provide derivation information |
| `seedId` | string | Owning seed wallet id (`seed` accounts only) |
| `family` | string | Chain family this account is bound to — single-family accounts (`watch`, `ledger`) only |

## Exit status

`0` success · `1` execution failure · `2` usage error. See [machine-interface](../machine-interface.md).

## See also

[`current`](current.md) · [`list`](list.md)
