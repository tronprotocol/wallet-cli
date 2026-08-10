# wallet-cli backup

Export an account's secret to a 0600 file — natively, or as a standard Web3 keystore. With `--records`, list past exports instead.

## Synopsis

```
wallet-cli backup <account> [--keystore] [--out <path>] [options]
wallet-cli backup --records [options]
```

## Arguments

- `account` — account or wallet to export, by accountId, label, or address. Required unless `--records` is given; with `--records` it selects **whose** exports to list.

## Options

| Option | Description |
|---|---|
| `--keystore` | Export as a standard Web3 keystore JSON instead of the native format |
| `--out <string>` | Output file path; omit to write `./<accountId>-<timestamp>.json` in the **current directory** (`.keystore.json` with `--keystore`); mode 0600, never overwritten |
| `--password-stdin` | read the master password from stdin (fd 0) |

Records options (with `--records`, instead of exporting):

| Option | Description |
|---|---|
| `--records` | List past exports instead of exporting anything |
| `--from <datetime>` | Only records at or after this instant — `YYYY-MM-DD` or `YYYY-MM-DD HH:mm:ss`, **UTC**, inclusive |
| `--to <datetime>` | Only records at or before this instant, same format, inclusive |
| `--limit <number>` | Max records to return; omit for all |
| `--offset <number>` | Pagination offset (default `0`) |
| `--account <ref>` | Only exports of this account, by accountId / label / address |

Plus [global options](index.md).

## Notes

The file contains recoverable secret material — move it to secure storage and treat it as the key itself. See [Security](../concepts/security.md).

> ⚠️ **Exports land in the current working directory** by default (changed in v4.12.0 — v4.11.0 wrote them under `<root>/backups/`; the filename is unchanged, only the directory). Do **not** run `backup` in a shared directory or inside a git repository. wallet-cli guarantees only mode 0600 and never overwriting an existing file; it does not vet the directory or check whether it is version-controlled.

### Native format vs `--keystore`

| | native (default) | `--keystore` |
|---|---|---|
| Contents | The account's own secret — the **mnemonic** for an HD wallet, the private key for a private-key wallet | Exactly **one private key**; an HD account exports only the key at its current index |
| Can rebuild the whole wallet? | Yes — re-import with [`import mnemonic`](import/mnemonic.md) | No. Nothing is derivable from it; it is an isolated account elsewhere |
| Read by other wallets? | No — wallet-cli's own format | Yes — standard V3 (`aes-128-ctr`, scrypt), importable by TronLink and the Java wallet-cli |
| Encrypted with | Not encrypted; the file itself is the secret | Your **master password** — that is also the password that opens it elsewhere |

Watch-only and Ledger accounts hold no exportable secret and fail with `not_exportable` — checked **before** any password is demanded.

## Examples

In the examples, `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`.

```bash
printf '%s' "$PW" | wallet-cli backup main --password-stdin
```

```console
⚠️ Backup written ./wlt_d1qbj2fb.0-1783751611076.json
  Account ID  wlt_d1qbj2fb.0
  Secret      recovery phrase
  File mode   0600
  Bytes       277

⚠️ Secret material was written only to the backup file, never to stdout.
```

```bash
printf '%s' "$PW" | wallet-cli backup main --keystore --password-stdin
```

```console
⚠️ Keystore written ./wlt_d1qbj2fb.0-1783751611076.keystore.json
  Account ID  wlt_d1qbj2fb.0
  Secret      private key
  File mode   0600
  Bytes       608

⚠️ Secret material was written only to the keystore file, never to stdout.
```

```bash
printf '%s' "$PW" | wallet-cli backup main --out ./main-backup.json --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"backup","data":{"accountId":"wlt_d1qbj2fb.0","label":"main","type":"seed","index":0,"active":true,"addresses":{"tron":"TJToBi4Ngr6JT3HqZHfCkKvuQTvqm73HHp"},"seedId":"wlt_d1qbj2fb","secretType":"mnemonic","format":"native","out":"./main-backup.json","fileMode":"0600","bytes":277},"meta":{"durationMs":1387,"warnings":[]}}
```

```bash
wallet-cli backup --records --limit 3
```

```console
Backup records (showing 3 of 12)
| Time (UTC)       | Exported account             | Operation         | File                                          |
| ---------------- | ---------------------------- | ----------------- | --------------------------------------------- |
| 2026-08-05 11:40 | TJToBi4Ngr...vqm73HHp (main) | backup --keystore | ./wlt_d1qbj2fb.0-1785930000000.keystore.json  |
| 2026-08-04 09:12 | TJToBi4Ngr...vqm73HHp (main) | backup            | ./wlt_d1qbj2fb.0-1785834720000.json           |
| 2026-07-30 22:03 | TBeta9mRk1...gW8pLxQ2        | backup            | ./tbeta-seed.json                             |
```

```bash
wallet-cli backup --records --account main --from 2026-08-01 -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"backup.records","data":{"records":[{"operation":"backup --keystore","accountId":"wlt_d1qbj2fb.0","account":"TJToBi4Ngr6JT3HqZHfCkKvuQTvqm73HHp","label":"main","out":"./wlt_d1qbj2fb.0-1785930000000.keystore.json","timestamp":"2026-08-05T11:40:00Z"}],"pagination":{"offset":0,"limit":null,"total":1}},"meta":{"durationMs":8,"warnings":[]}}
```

## Output

The two modes return **different shapes** and therefore different `command` ids: exporting reports `"command":"backup"`, the audit log reports `"command":"backup.records"`. Branch on that rather than probing for fields.

### Export (`backup [--keystore]`)

`data` is the exported account plus the file details. The secret is written only to the file, never to stdout. Local command — no `chain` block.

| Field | Type | Meaning |
|---|---|---|
| `accountId` | string | Account id |
| `label` | string | Account label |
| `type` | string | Account type (exportable: `seed` / `privateKey`) |
| `index` | number \| null | HD derivation index; `null` for private-key accounts |
| `active` | boolean | Whether it is the active account |
| `addresses.tron` | string | Base58 TRON address |
| `seedId` | string | Owning seed wallet id (`seed` accounts only) |
| `secretType` | string | Kind of exported secret: `mnemonic` or `privateKey` (always `privateKey` with `--keystore`) |
| `format` | string | `"native"` or `"keystore"` |
| `out` | string | Written file path |
| `fileMode` | string | File permissions, always `0600` |
| `bytes` | number | File size in bytes |

### Audit log (`backup --records`)

`data.records` is newest-first; `data.pagination` carries `offset`, `limit` (`null` when unlimited) and the pre-window `total`.

| Field | Type | Meaning |
|---|---|---|
| `operation` | string | `"backup"` or `"backup --keystore"` |
| `accountId` | string | The account whose secret was exported, as identified **at export time** |
| `account` | string | That account's TRON address |
| `label` | string \| null | Its label at export time (`null` if it had none) |
| `out` | string | The file the secret was written to |
| `timestamp` | string | UTC ISO-8601, second precision |

Every field is a **snapshot** taken when the export happened and is never re-resolved, so a later rename or deletion cannot rewrite history. `--account` still finds those records: it matches on either the recorded accountId or the recorded address.

Only **exports** are logged — `import` commands are not, since the log exists to trace secret material *leaving* this machine. Retention is a fixed **1000** most-recent entries (not configurable); older ones are dropped. The log itself holds no secrets, so `--records` needs no master password.

## Exit status

`0` success · `1` execution failure · `2` usage error. See [machine-interface](../machine-interface.md).

Notable codes: `not_exportable` (watch-only / Ledger account), `auth_failed` (wrong master password), `output_exists` (target file already exists — never overwritten), `io_error` (target path unwritable), `invalid_value` (bad `--from`/`--to`/`--limit`, or an export flag combined with `--records`).

## See also

[Security model](../concepts/security.md) · [`import keystore`](import/keystore.md) · [`import mnemonic`](import/mnemonic.md) · [`delete`](delete.md)
