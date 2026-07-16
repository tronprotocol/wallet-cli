# wallet-cli import mnemonic

Import a BIP39 mnemonic phrase. **Interactive-only.**

> **Note**: there are no `--mnemonic-stdin` / `--password-stdin` flags. The mnemonic and master password are entered **only** via hidden TTY prompts — a mnemonic can recover all funds, and stdin paths leak too easily into pipes, shell history, and process lists. Importing is rare enough that forcing human input costs little.

## Synopsis

```
wallet-cli import mnemonic [--label <name>]
```

## Description

Restores an HD wallet from an existing BIP39 mnemonic: derives account #0 and stores the seed encrypted under your master password. The imported wallet becomes active.

The interactive flow (all secrets hidden, never echoed, never in argv):

1. **Master password** — set on first use (with confirmation), or entered to unlock.
2. **Label** — optional display name; empty auto-generates one (e.g. `wallet_ad8f21`).
3. **Recovery phrase** — pasted hidden; an AI or script driving the CLI never sees it.
4. **Validate + store** — bad word count / checksum → `invalid_mnemonic`, re-prompt; on success the addresses are derived and the seed is written encrypted, never in plaintext.

Without a TTY the command fails with `tty_required` — there is no non-interactive path.

## Options

| Option | Description |
|---|---|
| `--label <string>` | Human-friendly unique account label, 1–64 chars; omit to auto-generate |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli import mnemonic --label restored
```

```console
? Set master password (hidden):
? Confirm master password:
? Paste recovery phrase (hidden):
✅ Imported wallet "restored"
  Account ID    wlt_d66fvems.0
  Type          HD
  TRON address  TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH
  Active        yes

⚠️ Recovery phrase was read from hidden input and was not printed.
```

```bash
wallet-cli import mnemonic --label restored -o json
```

```console
? Set master password (hidden):
? Confirm master password:
? Paste recovery phrase (hidden):
{"schema":"wallet-cli.result.v1","success":true,"command":"import.mnemonic","data":{"status":"created","accountId":"wlt_d66fvems.0","label":"restored","type":"seed","index":0,"active":true,"addresses":{"tron":"TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH"},"seedId":"wlt_d66fvems"},"meta":{"durationMs":38,"warnings":[]}}
```

## Output

`data` carries the imported account — addresses only, never any secret. Local command — no `chain` block.

| Field | Type | Meaning |
|---|---|---|
| `status` | string | `"created"` |
| `accountId` | string | Stable id `<seedId>.<index>` |
| `label` | string | Account label |
| `type` | string | `"seed"` (HD-derived) |
| `index` | number | HD derivation index (0 for the first account) |
| `active` | boolean | Became the active account |
| `addresses.tron` | string | Base58 TRON address |
| `seedId` | string | Owning seed wallet id |

## Exit status

`0` imported · `1` execution failure (`tty_required` — no TTY for interactive input; `auth_failed`; `password_mismatch`; `io_error`) · `2` usage error (invalid mnemonic, duplicate label).

## See also

[`import private-key`](private-key.md) · [`create`](../create.md) · [`change-password`](../change-password.md) · [Troubleshooting](../../troubleshooting.md)
