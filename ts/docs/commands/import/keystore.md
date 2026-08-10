# wallet-cli import keystore

Import a single account from a standard Web3 keystore JSON. **Interactive-only.**

> **Note**: there are no stdin flags here. **Two** passwords are entered via hidden TTY prompts — your master password (to store the key locally) and the keystore file's own password (to decrypt it). They may differ. A keystore password is a raw secret, so it follows the same TTY-only rule as a mnemonic or private key.

## Synopsis

```
wallet-cli import keystore <path> [--label <name>]
```

## Description

Reads a standard **V3** keystore (`version: 3`) as exported by TronLink, the Java wallet-cli, or [`backup --keystore`](../backup.md), and stores the private key it holds encrypted under your master password. The imported wallet becomes active.

A keystore carries **one private key and no seed** — nothing can be derived from it, so the account is standalone (`type: "privateKey"`, `index: null`). To move a whole HD wallet, use the native [`backup`](../backup.md) (which exports the mnemonic) and [`import mnemonic`](mnemonic.md).

The file is read and structurally validated **before** either password is requested, so a mistyped path costs no prompts. Accepted files use `aes-128-ctr` with either `scrypt` or `pbkdf2` (hmac-sha256) — the same set the Java implementation accepts. Anything else, including wallet-cli's own internal `version: 1` vault blobs, is rejected with `invalid_keystore`.

**A same-address account is refused, not overwritten.** This is a deliberate deviation from the Java implementation, which silently replaces it: that account may be an HD account whose seed the overwrite would destroy in exchange for a single derived key. Delete it explicitly first if you mean to replace it.

Without a TTY the command fails with `tty_required` — there is no non-interactive path.

## Arguments

- `path` — path to the keystore JSON file

## Options

| Option | Description |
|---|---|
| `--label <string>` | Human-friendly unique account label, 1–64 chars; omit to auto-generate |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli import keystore ./tronlink-export.json --label imported
```

```console
? Master password (hidden):
? Keystore file password (hidden):
✅ Imported wallet "imported"
  Account ID    wlt_7h2k9m1a
  Type          private key
  TRON address  TZx9kP2mQ7hV3nD8sL5cR1tY6bWqA4eJfU
  Active        yes

⚠️ The keystore password was read from hidden input and was not printed.
```

```bash
wallet-cli import keystore ./tronlink-export.json --label imported -o json
```

```console
? Master password (hidden):
? Keystore file password (hidden):
{"schema":"wallet-cli.result.v1","success":true,"command":"import.keystore","data":{"status":"created","accountId":"wlt_7h2k9m1a","label":"imported","type":"privateKey","index":null,"active":true,"addresses":{"tron":"TZx9kP2mQ7hV3nD8sL5cR1tY6bWqA4eJfU"}},"meta":{"durationMs":44,"warnings":[]}}
```

## Output

`data` carries the imported account — addresses only, never any secret. Local command — no `chain` block.

| Field | Type | Meaning |
|---|---|---|
| `status` | string | `"created"` |
| `accountId` | string | Stable account id (newly minted on this machine — ids never transfer) |
| `label` | string | Account label |
| `type` | string | `"privateKey"` (standalone, no seed) |
| `index` | number \| null | Non-HD account, always `null` |
| `active` | boolean | Became the active account |
| `addresses.tron` | string | Base58 TRON address, derived from the key itself |

## Errors

| Code | Meaning |
|---|---|
| `tty_required` | No TTY — both passwords are hidden-input only |
| `keystore_not_found` | No file at the given path |
| `invalid_keystore` | Not a valid V3 keystore (bad JSON, `version` ≠ 3, unsupported cipher/kdf, or a payload that is not a 32-byte key) |
| `wrong_keystore_password` | The keystore file's own password is wrong (its MAC did not match) |
| `auth_failed` | The master password is wrong |
| `account_exists` | An account with this address already exists locally — delete it first |

## Exit status

`0` imported · `1` execution failure (`wrong_keystore_password`, `auth_failed`, `account_exists`) · `2` usage error (`keystore_not_found`, `invalid_keystore`, `tty_required`, duplicate label).

## See also

[`backup --keystore`](../backup.md) · [`import private-key`](private-key.md) · [`import mnemonic`](mnemonic.md) · [`delete`](../delete.md) · [machine-interface → Secret handling](../../machine-interface.md#secret-handling)
