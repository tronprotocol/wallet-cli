# wallet-cli backup

Export an account's secret + metadata to a 0600 file.

## Synopsis

```
wallet-cli backup <account> [--out <path>] [options]
```

## Arguments

- `account` — account or wallet to export, by accountId, label, or address

## Options

| Option | Description |
|---|---|
| `--out <string>` | output file path; omit to write <root>/backups/<accountId>-<timestamp>.json; mode 0600, never overwritten |
| `--password-stdin` | read the master password from stdin (fd 0) |

Plus [global options](index.md).

## Notes

The file contains recoverable secret material — move it to secure storage and treat it as the key itself. See [Security](../concepts/security.md).

## Examples

In the examples, `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`.

```bash
printf '%s' "$PW" | wallet-cli backup main --password-stdin
```

```console
⚠️ Backup written <root>/backups/wlt_d1qbj2fb.0-1783751611076.json
  Account ID  wlt_d1qbj2fb.0
  Secret      recovery phrase
  File mode   0600
  Bytes       277

⚠️ Secret material was written only to the backup file, never to stdout.
```

```bash
printf '%s' "$PW" | wallet-cli backup main --out ./main-backup.json --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"backup","data":{"accountId":"wlt_d1qbj2fb.0","label":"main","type":"seed","index":0,"active":true,"addresses":{"tron":"TJToBi4Ngr6JT3HqZHfCkKvuQTvqm73HHp"},"seedId":"wlt_d1qbj2fb","secretType":"mnemonic","out":"./main-backup.json","fileMode":"0600","bytes":277},"meta":{"durationMs":1387,"warnings":[]}}
```

## Output

`data` is the backed-up account plus the backup file details. The secret is written only to the file, never to stdout. Local command — no `chain` block.

| Field | Type | Meaning |
|---|---|---|
| `accountId` | string | Account id |
| `label` | string | Account label |
| `type` | string | Account type (backupable: `seed` / `privateKey`) |
| `index` | number \| null | HD derivation index; `null` for private-key accounts |
| `active` | boolean | Whether it is the active account |
| `addresses.tron` | string | Base58 TRON address |
| `seedId` | string | Owning seed wallet id (`seed` accounts only) |
| `secretType` | string | Kind of exported secret, e.g. `mnemonic` |
| `out` | string | Backup file path |
| `fileMode` | string | File permissions, always `0600` |
| `bytes` | number | File size in bytes |

## Exit status

`0` success · `1` execution failure · `2` usage error. See [machine-interface](../machine-interface.md).

## See also

[Security model](../concepts/security.md) · [`delete`](delete.md)
