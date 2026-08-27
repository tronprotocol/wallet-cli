# wallet-cli backup

Export an account's secret to a 0600 file, or review past exports.

## Synopsis

```
wallet-cli backup <account> [--keystore] [--out <path>] [--password-stdin] [options]
wallet-cli backup --records [<account>] [--from <datetime>] [--to <datetime>] [--limit <n>] [--offset <n>] [--account <ref>] [options]
```

## Description

With an account, `backup` writes that account's secret material and metadata to a file created with mode **0600**, never overwriting an existing one. The secret goes only into the file — never to stdout. Watch-only and Ledger accounts have no secret to export and fail with `not_exportable` — checked before any password is demanded, so an account that cannot be exported never costs you a prompt.

Two formats:

- **Native** (default) — the wallet's own backup JSON. A seed account exports its recovery phrase, so the whole seed moves with it.
- **`--keystore`** — a standard Web3 keystore JSON, importable by TronLink and others, encrypted with **your master password**. A keystore holds a **single private key**: an HD account exports only its current derived key, and that key arrives elsewhere as a standalone account with nothing derivable from it. Use the native format to move a seed.

**A keystore also holds one key per *family*.** A seed account derives a different key for TRON (coin type 195) and for EVM (coin type 60), and a keystore can carry only one of them, so `--network` selects which — falling back to `config.defaultNetwork` when omitted. The receipt names the family that was written, and the export log records it. A private-key account has a single key and ignores the selection; the native backup covers every family at once, so it needs no choice and reports none.

**Files land in the current working directory** by default — `./<accountId>-<timestamp>.json`, or `./<accountId>-<timestamp>.keystore.json` with `--keystore`. `--out` overrides the path.

> A file holding a private key or recovery phrase is now sitting in your working directory. Do not run this in a shared directory or inside a git repository: the CLI guarantees mode 0600 and refuses to overwrite, but it does not check whether the directory is safe or version-controlled. Move the file to secure storage and treat it as the key itself — see [Security](../concepts/security.md).

With `--records` and no account, nothing is exported: the command lists the **local audit log of past exports** instead. One row per `backup` and `backup --keystore`, newest first, recording which account's secret left, when, and **which file it went to**. Imports are not logged — the log's purpose is a trail of secrets leaving. It keeps the most recent 1000 entries and drops the oldest beyond that. `Exported account` is the account whose secret was exported, and `--account` filters on it.

**The two forms do not mix, and the CLI enforces that in both directions:**

- `--keystore` and `--out` describe an export, so combining either with `--records` fails rather than being silently ignored.
- `--from` / `--to` / `--limit` / `--offset` filter the log, so any of them **without** `--records` fails too.

Both are `invalid_value` at exit `2`, and the message names the offending flag — for example `invalid --offset: --offset filters the export log; it needs --records`.

The positional account is the exception: it means different things in the two forms rather than conflicting with `--records`. `backup main` exports `main`'s secret; `backup main --records` lists `main`'s past exports, exactly as `--account main` would.

## Options

| Option | Description |
|---|---|
| `<account>` | Account to export, by accountId, label, or address. Required unless `--records`; **with** `--records` it filters the log instead, like `--account` |
| `--keystore` | Export as a standard Web3 keystore instead of the native format |
| `--out <path>` | Output file path; mode 0600, never overwritten (default: the current directory, see above) |
| `--password-stdin` | Master password from stdin (fd 0) |
| `--network <id>` | With `--keystore`, which family's key to export (`tron:nile` → the TRON key, `evm:1` → the EVM key). No node is contacted |

With `--records`, instead of an account:

| Option | Description |
|---|---|
| `--records` | List past exports instead of exporting |
| `--from <datetime>` | Only records at or after this time, `YYYY-MM-DD[ HH:mm:ss]`, UTC |
| `--to <datetime>` | Only records at or before this time, same format |
| `--limit <number>` | Max records to return (default: all) |
| `--offset <number>` | Pagination offset (default `0`) |
| `--account <ref>` | Only exports of this account, by accountId / label / address |

Plus the [global options](index.md#global-options-every-command).

## Examples

In the examples, `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`.

Native export of a seed account — the recovery phrase:

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

As a keystore instead — a single private key:

```bash
printf '%s' "$PW" | wallet-cli backup main --keystore --password-stdin
```

```console
⚠️ Keystore written ./wlt_d1qbj2fb.0-1785930000.keystore.json
  Account ID  wlt_d1qbj2fb.0
  Family      tron
  Secret      private key
  File mode   0600
  Bytes       491

⚠️ Secret material was written only to the keystore file, never to stdout.
```

```bash
printf '%s' "$PW" | wallet-cli backup main --keystore --out ./main.keystore.json --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"backup","data":{"accountId":"wlt_d1qbj2fb.0","label":"main","type":"seed","index":0,"active":true,"addresses":{"tron":"TQkXm4vN...5Zt7Uw","evm":"0x7B28FE10...46C9C"},"seedId":"wlt_d1qbj2fb","derivationPath":{"tron":"m/44'/195'/0'/0/0","evm":"m/44'/60'/0'/0/0"},"family":"tron","secretType":"privateKey","format":"keystore","out":"./main.keystore.json","fileMode":"0600","bytes":491},"meta":{"durationMs":1420,"warnings":[]}}
```

The audit log:

```bash
wallet-cli backup --records --limit 3
```

```console
Backup records (showing 3 of 12)
| Time (UTC)       | Exported account         | Operation         | File                                      |
| ---------------- | ------------------------ | ----------------- | ----------------------------------------- |
| 2026-08-05 11:40 | TQkXm4vN...5Zt7Uw (main) | backup --keystore | ./wlt_d1qbj2fb.0-1785930000.keystore.json |
| 2026-08-04 09:12 | TQkXm4vN...5Zt7Uw (main) | backup            | ./wlt_d1qbj2fb.0-1785834720.json          |
| 2026-07-30 22:03 | TBeta9mR...8pLx          | backup            | ./tbeta-seed.json                         |
```

```bash
wallet-cli backup --records --limit 3 -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"backup.records","data":{"records":[{"operation":"backup --keystore","accountId":"wlt_d1qbj2fb.0","account":"TQkXm4vN...5Zt7Uw","label":"main","out":"./wlt_d1qbj2fb.0-1785930000.keystore.json","timestamp":"2026-08-05T11:40:00Z"},{"operation":"backup","accountId":"wlt_d1qbj2fb.0","account":"TQkXm4vN...5Zt7Uw","label":"main","out":"./wlt_d1qbj2fb.0-1785834720.json","timestamp":"2026-08-04T09:12:00Z"},{"operation":"backup","accountId":"wlt_9x3k2m7p.0","account":"TBeta9mR...8pLx","label":null,"out":"./tbeta-seed.json","timestamp":"2026-07-30T22:03:00Z"}]},"meta":{"durationMs":8,"warnings":[],"pagination":{"offset":0,"limit":3,"total":12}}}
```

## Output

Both forms are local commands — no `chain` block — and they carry different `command` ids: `backup` for an export, `backup.records` for the log.

`data` for an export is the account plus the file's details:

| Field | Type | Meaning |
|---|---|---|
| `accountId` | string | Account id |
| `label` | string | Account label |
| `type` | string | Account type (exportable: `seed` / `privateKey`) |
| `index` | number \| null | HD derivation index; `null` for private-key accounts |
| `active` | boolean | Whether it is the active account |
| `addresses` | object | One entry per family the account can produce: `tron` and/or `evm` |
| `derivationPath` | object \| null | Per-family BIP44 path for `seed` accounts; `null` for `privateKey` |
| `family` | string | With `--keystore`, which family's key was written; absent for a native backup, which covers every family |
| `seedId` | string | Owning seed wallet id (`seed` accounts only) |
| `secretType` | string | Kind of exported secret — `mnemonic`, or `privateKey` with `--keystore` |
| `format` | string | `keystore` when `--keystore` was used |
| `out` | string | Path written |
| `fileMode` | string | File permissions, always `0600` |
| `bytes` | number | File size in bytes |

`data.records[]` for `--records`:

| Field | Type | Meaning |
|---|---|---|
| `operation` | string | `backup` or `backup --keystore` |
| `accountId` / `account` / `label` | string \| null | The account whose secret was exported; `label` is `null` when unset |
| `out` | string | File the secret went to |
| `timestamp` | string | Export time, UTC |

`meta.pagination` carries `offset`, `limit` (`null` = unlimited), and `total`.

## Exit status

`0` success · `1` execution failure (`not_exportable` — watch-only or Ledger, `invalid_value` — no such account, `auth_failed`, `io_error` — path not writable) · `2` usage error (`output_exists` — the target file already exists and is never overwritten; `invalid_value` — a record filter without `--records`, `--keystore` / `--out` with `--records`, or a bad time / limit / offset).

`invalid_value` appears under both exit codes here: an unresolvable account reference is exit `1`, a malformed call is exit `2`. Branch on the exit code first.

## See also

[Security model](../concepts/security.md) · [`import keystore`](import/keystore.md) · [`delete`](delete.md)
