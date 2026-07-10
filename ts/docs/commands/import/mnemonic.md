# wallet-cli import mnemonic

Import a BIP39 mnemonic phrase. **Interactive-only.**

> **Changed in v0.1.1**: the `--mnemonic-stdin` / `--password-stdin` flags were removed. The mnemonic and master password are now entered **only** via hidden TTY prompts — a mnemonic can recover all funds, and stdin paths leak too easily into pipes, shell history, and process lists. Importing is rare enough that forcing human input costs little.

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

```console
$ wallet-cli import mnemonic --label restored
? Master password (hidden):
? Paste recovery phrase (hidden):
✓ Imported wallet "restored"
  Account ID     wlt_d66fvems.0
  Type           HD wallet (encrypted recovery phrase)
  TRON address   TNmoJ3Be59...iL3G8HVB
  EVM address    0xe4aAd117...7c952961

! Recovery phrase was read from hidden input and was not printed.
```

## Output

`data` carries the imported account (same shape as [`list`](../list.md) entries) — addresses only, never any secret. Local command — no `chain` block.

| Field | Type | Meaning |
|---|---|---|
| `accountId` | string | Stable id `<seedId>.<index>` |
| `label` | string | Account label |
| `type` | string | `seed` (HD wallet) |
| `active` | boolean | Became the active account |
| `addresses.tron` | string | Base58 TRON address |
| `addresses.evm` | string | EVM address (0x) |

## Exit status

`0` imported · `1` execution failure (`tty_required` — no TTY for interactive input; `wrong_password`; `password_mismatch`; `io_error`) · `2` usage error (invalid mnemonic, duplicate label).

## See also

[`import private-key`](private-key.md) · [`create`](../create.md) · [`change-password`](../change-password.md) · [Troubleshooting](../../troubleshooting.md)
