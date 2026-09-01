# wallet-cli import private-key

Import a raw private key. **Interactive-only.**

> **Note**: there are no `--private-key-stdin` / `--password-stdin` flags. The private key and master password are entered **only** via hidden TTY prompts — a private key is as sensitive as a mnemonic, so the same constraint applies.

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

```bash
wallet-cli import private-key --label hot
```

```console
? Set master password (hidden):
? Confirm master password:
? Paste private key (hidden):
✅ Imported wallet "hot"
  Account ID    wlt_2qnr6j1f
  Type          private key
  TRON address  TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC
  EVM address   0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
  Active        yes

⚠️ Private key was read from hidden input and was not printed.
```

```bash
wallet-cli import private-key --label hot -o json
```

```console
? Set master password (hidden):
? Confirm master password:
? Paste private key (hidden):
{"schema":"wallet-cli.result.v1","success":true,"command":"import.private-key","data":{"status":"created","accountId":"wlt_2qnr6j1f","label":"hot","type":"privateKey","index":null,"active":true,"addresses":{"tron":"TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC","evm":"0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"},"derivationPath":null},"meta":{"durationMs":38,"warnings":[]}}
```

## Output

`data` carries the imported account — addresses only, never any secret. Local command — no `chain` block.

| Field | Type | Meaning |
|---|---|---|
| `status` | string | `"created"`, or `"existing"` when the same key was already present (the existing account is selected) |
| `accountId` | string | Stable account id |
| `label` | string | Account label |
| `type` | string | `"privateKey"` (standalone, no seed) |
| `index` | number \| null | Non-HD account, always `null` |
| `active` | boolean | Became the active account |
| `addresses` | object | Both encodings of the imported key: `tron` (base58) and `evm` (EIP-55) |
| `derivationPath` | null | A raw private key has no derivation path |

## Exit status

`0` imported · `1` execution failure (`auth_failed` — the entered master password does not match an existing keystore; `invalid_private_key` — storage validation rejected the key; `io_error`) · `2` usage error (`tty_required` — no TTY for the hidden prompts; `invalid_value` — invalid or duplicate label). An invalid key or weak new password entered at a TTY prompt is rejected there and re-prompted rather than returned as a terminal error.

## See also

[`import mnemonic`](mnemonic.md) · [`backup`](../backup.md) · [`change-password`](../change-password.md) · [machine-interface → Secret handling](../../machine-interface.md#secret-handling)
