# wallet-cli import private-key

Import a raw private key. **Interactive-only.**

> **Changed in v0.1.1**: the `--private-key-stdin` / `--password-stdin` flags were removed. The private key and master password are now entered **only** via hidden TTY prompts — a private key is as sensitive as a mnemonic, so the same constraint applies.

## Synopsis

```
wallet-cli import private-key [--label <name>]
```

## Description

Imports a single account from a raw private key and stores it encrypted under your master password. Unlike mnemonic imports, a private-key account has no seed — nothing can be derived from it. The imported wallet becomes active.

The interactive flow mirrors [`import mnemonic`](mnemonic.md): master password (hidden) → label → private key (hidden, never echoed) → validate (`invalid_private_key` re-prompts) and store encrypted. Without a TTY the command fails with `tty_required` — there is no non-interactive path.

## Options

| Option | Description |
|---|---|
| `--label <string>` | Human-friendly unique account label, 1–64 chars; omit to auto-generate |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```console
$ wallet-cli import private-key --label hot
? Master password (hidden):
? Paste private key (hidden):
✓ Imported wallet "hot"
  Account ID     wlt_2qnr6j1f
  Type           Private key wallet (encrypted)
  TRON address   TTicojVPu9...mzMjyM3R
  EVM address    0xc2afe557...e575F16E

! Private key was read from hidden input and was not printed.
```

## Output

`data` carries the imported account (same shape as [`list`](../list.md) entries) — addresses only, never any secret. Local command — no `chain` block.

| Field | Type | Meaning |
|---|---|---|
| `accountId` | string | Stable account id |
| `label` | string | Account label |
| `type` | string | `private-key` (standalone, no seed) |
| `active` | boolean | Became the active account |
| `addresses.tron` | string | Base58 TRON address |
| `addresses.evm` | string | EVM address (0x) |

## Exit status

`0` imported · `1` execution failure (`tty_required` — no TTY for interactive input; `wrong_password`; `password_mismatch`; `io_error`) · `2` usage error (invalid private key, duplicate label).

## See also

[`import mnemonic`](mnemonic.md) · [`backup`](../backup.md) · [`change-password`](../change-password.md) · [machine-interface → Secret handling](../../machine-interface.md#secret-handling)
