# wallet-cli import keystore

Import an account from a Web3 keystore file. **Interactive-only.**

> **Note**: there are no stdin flags here. Both the master password and the keystore file's own password are entered **only** via hidden TTY prompts — the file password is secret material like any other.

## Synopsis

```
wallet-cli import keystore <path> [--label <name>]
```

## Description

Imports a single account from a standard Web3 keystore JSON — the format TronLink exports, and what [`backup --keystore`](../backup.md) writes — and stores it encrypted under your master password. The imported wallet becomes active.

A keystore holds **one private key**, so the resulting account has no seed and nothing can be derived from it, exactly like [`import private-key`](private-key.md). Its `type` is recorded as `privateKey`.

Two passwords are involved and they are unrelated: your master password encrypts the account into local storage, the keystore's own password decrypts the file. They are prompted in that order, and only **after** the file has been read and structurally checked — so a mistyped path costs no password typing.

Without a TTY the command fails with `tty_required` at exit `2`, and that check runs **first**, ahead of the file. In a non-interactive environment every call fails the same way whether the path is good or not; the file-before-password ordering above only applies once you have a terminal.

If an account with the same address already exists locally, the import is **refused** rather than overwriting it: replacing an address silently could destroy the seed backup an existing account depends on. Delete the existing account first if replacement is what you want.

## Options

| Option | Description |
|---|---|
| `<path>` | **Required.** Path to the keystore JSON file |
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
  TRON address  TZx9kP2m...7bWq
  Active        yes

⚠️ The keystore password was read from hidden input and was not printed.
```

```bash
wallet-cli import keystore ./tronlink-export.json --label imported -o json
```

```console
? Master password (hidden):
? Keystore file password (hidden):
{"schema":"wallet-cli.result.v1","success":true,"command":"import.keystore","data":{"status":"created","accountId":"wlt_7h2k9m1a","label":"imported","type":"privateKey","index":null,"active":true,"addresses":{"tron":"TZx9kP2m...7bWq"}},"meta":{"durationMs":44,"warnings":[]}}
```

## Output

`data` carries the imported account — addresses only, never any secret. Local command — no `chain` block.

| Field | Type | Meaning |
|---|---|---|
| `status` | string | `"created"` |
| `accountId` | string | Stable account id |
| `label` | string | Account label |
| `type` | string | `"privateKey"` (standalone, no seed) |
| `index` | number \| null | Non-HD account, always `null` |
| `active` | boolean | Became the active account |
| `addresses.tron` | string | Base58 TRON address |

## Exit status

`0` imported · `1` execution failure (`keystore_not_found` — no such file; `invalid_keystore` — not a valid keystore JSON; `wrong_keystore_password`; `account_exists` — this address is already in the wallet; `auth_failed`; `io_error`) · `2` usage error (`tty_required` — no TTY for interactive input, checked before anything else; duplicate label).

## See also

[`backup`](../backup.md) · [`import private-key`](private-key.md) · [`delete`](../delete.md) · [machine-interface → Secret handling](../../machine-interface.md#secret-handling)
