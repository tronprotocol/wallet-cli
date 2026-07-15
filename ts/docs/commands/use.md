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
  TRON address  TRs9HgTuY3dT3yDasdFdP9WQHqL37891Ax
```

You can also select by accountId or address: `wallet-cli use wlt_758891fa.1` / `wallet-cli use TRs9Hg…`.

```bash
wallet-cli use main-1 -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"use","data":{"previous":"wlt_758891fa.0","accountId":"wlt_758891fa.1","label":"main-1","type":"seed","index":1,"active":true,"addresses":{"tron":"TRs9HgTuY3dT3yDasdFdP9WQHqL37891Ax"},"seedId":"wlt_758891fa"},"meta":{"durationMs":14,"warnings":[]}}
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
| `addresses.tron` | string | Base58 TRON address |
| `seedId` | string | Owning seed wallet id (`seed` accounts only) |
| `family` | string | Chain family, e.g. `tron` (`watch` accounts only) |

## Exit status

`0` success · `1` execution failure · `2` usage error. See [machine-interface](../machine-interface.md).

## See also

[`current`](current.md) · [`list`](list.md)
