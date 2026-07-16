# wallet-cli current

Show the current (active) account.

## Synopsis

```
wallet-cli current [options]
```

## Options

[Global options](index.md) only.

## Examples

```bash
wallet-cli current
```

```console
Active account: main-1
  TRON address  TRs9HgTuY3dT3yDasdFdP9WQHqL37891Ax
```

```bash
wallet-cli current -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"current","data":{"accountId":"wlt_758891fa.1","label":"main-1","type":"seed","index":1,"active":true,"addresses":{"tron":"TRs9HgTuY3dT3yDasdFdP9WQHqL37891Ax"},"seedId":"wlt_758891fa"},"meta":{"durationMs":13,"warnings":[]}}
```

With no active account yet, it fails with `missing_wallet_address` (exit 1):

```bash
wallet-cli current
```

```console
error [missing_wallet_address]: no active account; import one first
```

## Output

`data` is the current active account. Local command — no `chain` block.

| Field | Type | Meaning |
|---|---|---|
| `accountId` | string | Active account id |
| `label` | string | Account label |
| `type` | string | `seed` / `privateKey` / `watch` / `ledger` |
| `index` | number \| null | HD derivation index; `null` for non-HD accounts |
| `active` | boolean | Always `true` |
| `addresses.tron` | string | Base58 TRON address |
| `seedId` | string | Owning seed wallet id (`seed` accounts only) |
| `family` | string | Chain family, e.g. `tron` (`watch` accounts only) |

## Exit status

`0` success · `1` execution failure · `2` usage error. See [machine-interface](../machine-interface.md).

## See also

[`use`](use.md) · [`list`](list.md)
