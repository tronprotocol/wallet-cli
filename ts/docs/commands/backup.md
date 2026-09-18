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

- **Native** — the wallet's own backup JSON. A seed account exports its recovery phrase, so the whole seed moves with it.
- **`--keystore`** — a standard Web3 keystore JSON, importable by TronLink and others, encrypted with **your master password**. A keystore holds a **single private key**: an HD account exports only its current derived key, and that key arrives elsewhere as a standalone account with nothing derivable from it. Use the native format to move a seed.

Without `--keystore`, a fully interactive terminal asks which format to write, before the password prompt:

```console
? Backup format (Up/Down, Enter)
> Native wallet backup (recovery phrase for the whole HD wallet)
  Web3 keystore (single TRON private key)
```

When the password comes from `--password-stdin`, or the run is otherwise non-interactive, there is no prompt and the native format is written.

A native backup of a wallet created before 4.13.1 can print a warning: some of its TRON accounts use an old path that importing the recovery phrase will not bring back. The warning names each account and the `--keystore` command that saves its key. Run those before deleting the wallet — see [Recover addresses after `legacy_derivation`](../troubleshooting/legacy-derivation-recovery.md).

A seed derives a different key per chain family, and a keystore carries only one of them, so `--network` selects which family's key is written — falling back to `config.defaultNetwork` when omitted. The receipt names the family it wrote, and so does the export log. A private-key account has one key and ignores the selection; the native format covers every family at once, so it needs no choice and reports none.

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
| `--keystore` | Export as a standard Web3 keystore instead of the native format. Omit it in an interactive terminal to choose from a prompt |
| `--out <path>` | Output file path; mode 0600, never overwritten (default: the current directory, see above) |
| `--password-stdin` | Master password from stdin (fd 0) |

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

Native export of a seed account — the recovery phrase, written to the current directory:

```bash
printf '%s' "$PW" | wallet-cli backup main --password-stdin
```

```console
⚠️ Backup written /home/you/wlt_kwyjcwdh.0-1789571843395.json
  Account ID  wlt_kwyjcwdh.0
  Secret      recovery phrase
  File mode   0600
  Bytes       325

⚠️ Secret material was written only to the backup file, never to stdout.
```

```bash
printf '%s' "$PW" | wallet-cli backup main --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"backup","data":{"accountId":"wlt_kwyjcwdh.0","label":"main","type":"seed","index":0,"active":true,"addresses":{"tron":"TEKbsrcsL74XyNWH6ju9zfjGDNok78dtTa","evm":"0xeb0a0D15e3B8f6E2FC4bc011Eb6644f1ce3E4fa2"},"seedId":"wlt_kwyjcwdh","derivationPath":{"tron":"m/44'/195'/0'/0/0","evm":"m/44'/60'/0'/0/0"},"secretType":"mnemonic","format":"native","out":"/home/you/wlt_kwyjcwdh.0-1789571843395.json","fileMode":"0600","bytes":325},"meta":{"durationMs":2187,"warnings":[]},"chain":{"family":"tron","network":"tron:728126428","chainId":"728126428"}}
```

As a keystore instead — a single private key, here the TRON one of the default network:

```bash
printf '%s' "$PW" | wallet-cli backup main --keystore --out ./main.keystore.json --password-stdin
```

```console
⚠️ Keystore written /home/you/main.keystore.json
  Account ID  wlt_kwyjcwdh.0
  Family      tron
  Secret      private key
  File mode   0600
  Bytes       608

⚠️ Secret material was written only to the keystore file, never to stdout.
```

```bash
printf '%s' "$PW" | wallet-cli backup main --keystore --out ./main.keystore.json --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"backup","data":{"accountId":"wlt_kwyjcwdh.0","label":"main","type":"seed","index":0,"active":true,"addresses":{"tron":"TEKbsrcsL74XyNWH6ju9zfjGDNok78dtTa","evm":"0xeb0a0D15e3B8f6E2FC4bc011Eb6644f1ce3E4fa2"},"seedId":"wlt_kwyjcwdh","derivationPath":{"tron":"m/44'/195'/0'/0/0","evm":"m/44'/60'/0'/0/0"},"family":"tron","secretType":"privateKey","format":"keystore","out":"/home/you/main.keystore.json","fileMode":"0600","bytes":608},"meta":{"durationMs":1858,"warnings":[]},"chain":{"family":"tron","network":"tron:728126428","chainId":"728126428"}}
```

The audit log of past exports, newest first:

```bash
wallet-cli backup --records --limit 3
```

```console
Backup records (showing 3 of 4)
| Time (UTC)       | Exported account             | Operation         | File                                        |
| ---------------- | ---------------------------- | ----------------- | ------------------------------------------- |
| 2026-09-16 15:17 | TEKbsrcsL7...ok78dtTa (main) | backup --keystore | /home/you/main-2.keystore.json              |
| 2026-09-16 15:17 | TEKbsrcsL7...ok78dtTa (main) | backup --keystore | /home/you/main.keystore.json                |
| 2026-09-16 15:17 | TEKbsrcsL7...ok78dtTa (main) | backup            | /home/you/wlt_kwyjcwdh.0-1789571843395.json |
```

```bash
wallet-cli backup --records --limit 3 -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"backup.records","data":{"records":[{"operation":"backup --keystore","accountId":"wlt_kwyjcwdh.0","account":"TEKbsrcsL74XyNWH6ju9zfjGDNok78dtTa","family":"tron","label":"main","out":"/home/you/main-2.keystore.json","timestamp":"2026-09-16T15:17:27Z"},{"operation":"backup --keystore","accountId":"wlt_kwyjcwdh.0","account":"TEKbsrcsL74XyNWH6ju9zfjGDNok78dtTa","family":"tron","label":"main","out":"/home/you/main.keystore.json","timestamp":"2026-09-16T15:17:25Z"},{"operation":"backup","accountId":"wlt_kwyjcwdh.0","account":"TEKbsrcsL74XyNWH6ju9zfjGDNok78dtTa","label":"main","out":"/home/you/wlt_kwyjcwdh.0-1789571843395.json","timestamp":"2026-09-16T15:17:23Z"}]},"meta":{"durationMs":17,"warnings":[],"pagination":{"offset":0,"limit":3,"total":4}},"chain":{"family":"tron","network":"tron:728126428","chainId":"728126428"}}
```

## Output

Both forms are local and contact no node, but `backup` has an optional network display selector: the selected or default network decides which family `--keystore` exports. The envelope therefore carries a `chain` block, `--records` included. The two forms carry different `command` ids: `backup` for an export, `backup.records` for the log.

`data` for an export is the account plus the file's details:

| Field | Type | Meaning |
|---|---|---|
| `accountId` | string | Account id |
| `label` | string | Account label |
| `type` | string | Account type (exportable: `seed` / `privateKey`) |
| `index` | number \| null | HD derivation index; `null` for private-key accounts |
| `active` | boolean | Whether it is the active account |
| `addresses` | object | One entry per family the account can produce: `tron` (base58) and/or `evm` (`0x`) |
| `seedId` | string | Owning seed wallet id (`seed` accounts only) |
| `derivationPath` | object \| null | The verified path behind each address, read from the seed — for an old account this is the pre-4.13.1 TRON path it actually uses. `null` for a private-key account |
| `family` | string | With `--keystore`, whose family's key was written; absent for a native backup, which covers every family |
| `secretType` | string | Kind of exported secret — `mnemonic`, or `privateKey` with `--keystore` |
| `format` | string | `native` or `keystore` |
| `out` | string | **Absolute** path written — a relative `--out` is resolved against the working directory before it is reported |
| `fileMode` | string | File permissions, always `0600` |
| `bytes` | number | File size in bytes |

`data.records[]` for `--records`:

| Field | Type | Meaning |
|---|---|---|
| `operation` | string | `backup` or `backup --keystore` |
| `family` | string | For `backup --keystore`, whose family's key was exported; absent for a native backup |
| `accountId` / `account` / `label` | string \| null | The account whose secret was exported; `label` is `null` when unset |
| `out` | string | File the secret went to, as an **absolute** path |
| `timestamp` | string | Export time, UTC |

`meta.pagination` carries `offset`, `limit` (`null` = unlimited), and `total`.

## Exit status

`0` success · `1` execution failure (`not_exportable` — watch-only or Ledger; `auth_failed`; `io_error` — path not writable) · `2` usage error (`account_not_found` — no such account; `output_exists` — the target file already exists and is never overwritten; `invalid_value` — a record filter without `--records`, `--keystore` / `--out` with `--records`, or a bad time / limit / offset).

## See also

[Security model](../concepts/security.md) · [`import keystore`](import/keystore.md) · [`delete`](delete.md)
