# wallet-cli create

Create a new HD wallet (BIP39 seed).

## Synopsis

```
wallet-cli create [options]
```

## Description

Generates a new BIP39 seed, derives account #0, encrypts everything under your master password, and stores it locally. The mnemonic is **not printed** — the seed is encrypted at rest; run [`backup`](backup.md) to export the recovery phrase to a `0600` file. Further accounts can be derived from the same seed later with [`derive`](derive.md).

Requires the **master password**: pass `--password-stdin` for non-interactive use, or enter it at the TTY prompt. The password must be at least 8 characters and include an uppercase letter, a lowercase letter, a digit, and a special character (`!@#$%^&*()-_=+[]{};:,.?`); a weaker one fails with `weak_password` (exit 2).

## Options

| Option | Description |
|---|---|
| `--label <string>` | Human-friendly unique account label, 1–64 chars; omit to auto-generate |
| `--password-stdin` | Read the master password from stdin (fd 0); only one `*-stdin` flag can consume stdin per run |

Plus the [global options](index.md#global-options-every-command).

## Examples

In the examples, `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`.

Interactive — prompts for the master password, then shows the new account:

```bash
wallet-cli create --label main
```

```console
? Set master password (hidden):
? Confirm master password:
✅ Created wallet "main"
  Account ID    wlt_2dbv24de.0
  Type          HD
  TRON address  TTVdGTBXY5mmY3nJFGUp7Vo898kUJ6gtFQ
  Active        yes

⚠️ Recovery phrase is encrypted locally and was not printed.
⚠️ Run `backup` soon and store the file offline.
```

Non-interactive (password piped from stdin):

```bash
printf '%s' "$PW" | wallet-cli create --label main --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"create","data":{"status":"created","accountId":"wlt_2dbv24de.0","label":"main","type":"seed","index":0,"active":true,"addresses":{"tron":"TTVdGTBXY5mmY3nJFGUp7Vo898kUJ6gtFQ"},"seedId":"wlt_2dbv24de"},"meta":{"durationMs":38,"warnings":[]}}
```

## Output

`data` describes the created account (local command — no `chain` block). No mnemonic field is ever returned.

| Field | Type | Meaning |
|---|---|---|
| `status` | string | `"created"` |
| `accountId` | string | Stable id `<seedId>.<index>` |
| `label` | string | Account label |
| `type` | string | `"seed"` (HD-derived) |
| `index` | number | HD derivation index (0 for the first account) |
| `active` | boolean | Whether it became the active account |
| `addresses.tron` | string | Base58 TRON address |
| `seedId` | string | Owning seed wallet id |

## Exit status

`0` created · `1` execution failure · `2` usage error (e.g. label already taken / invalid, `weak_password`). See [machine-interface](../machine-interface.md#exit-codes).

## See also

[`import mnemonic`](import/mnemonic.md) · [`list`](list.md) · [`derive`](derive.md) · [`backup`](backup.md) · [Getting started](../guide/getting-started.md)
