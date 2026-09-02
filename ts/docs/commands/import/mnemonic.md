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
2. **Label** — optional display name; the prompt offers a random default (`wallet_ad8f21`), and pressing Enter accepts it.
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
  EVM address   0xd41F7a6C39e05B28fA1c7D930e64b8517cA2F069
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
{"schema":"wallet-cli.result.v1","success":true,"command":"import.mnemonic","data":{"status":"created","accountId":"wlt_d66fvems.0","label":"restored","type":"seed","index":0,"active":true,"addresses":{"tron":"TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH","evm":"0xd41F7a6C39e05B28fA1c7D930e64b8517cA2F069"},"seedId":"wlt_d66fvems","derivationPath":{"tron":"m/44'/195'/0'/0/0","evm":"m/44'/60'/0'/0/0"}},"meta":{"durationMs":38,"warnings":[]}}
```

## Output

`data` carries the imported account — addresses only, never any secret. Local command — no `chain` block.

| Field | Type | Meaning |
|---|---|---|
| `status` | string | `"created"`, or `"existing"` when the mnemonic's account #0 was already present (the existing account is selected) |
| `accountId` | string | Stable id `<seedId>.<index>` |
| `label` | string | Account label |
| `type` | string | `"seed"` (HD-derived) |
| `index` | number | HD derivation index (0 for the first account) |
| `active` | boolean | Became the active account |
| `addresses` | object | Both derived addresses: `tron` (base58) and `evm` (EIP-55) |
| `seedId` | string | Owning seed wallet id |
| `derivationPath` | object | Per-family BIP44 path for account index 0 |

## Exit status

`0` imported · `1` execution failure (`auth_failed` — the entered master password does not match an existing keystore; `invalid_mnemonic` — storage validation rejected the phrase; `io_error`) · `2` usage error (`tty_required` — no TTY for the hidden prompts; `invalid_value` — invalid or duplicate label). An invalid phrase or weak new password entered at a TTY prompt is rejected there and re-prompted rather than returned as a terminal error.

## See also

[`import private-key`](private-key.md) · [`create`](../create.md) · [`change-password`](../change-password.md) · [Troubleshooting](../../troubleshooting.md)
