# Security Model

What wallet-cli protects, how, and what remains your job.

## Local storage

All secrets (seeds, private keys) are stored **encrypted under your master password**; nothing usable is on disk in the clear. Metadata (labels, addresses) is readable without unlock — that's why `list` needs no password but `tx send` does.

The master password is local protection only: it is never sent anywhere and **cannot be recovered**. It must be at least 8 characters with an uppercase letter, a lowercase letter, a digit, and a special character.

The recovery object is the BIP39 mnemonic, but `create` never prints it — the seed is stored encrypted. Run [`backup`](../commands/backup.md) to export the plaintext mnemonic to a `0600` file and keep that file offline. Lose both password and backup and the funds are gone; lose only the password and `import mnemonic` (using the phrase from your backup) restores everything.

## Secrets in transit: stdin or TTY, never argv/env

Anything in a command's arguments or environment leaks into shell history, `ps` output, and CI logs. wallet-cli therefore refuses secrets there — they enter only via:

- interactive TTY prompts, or
- explicit stdin flags: `--password-stdin`, `--tx-stdin` — **one `*-stdin` flag per run**, so a pipeline can never silently feed the wrong secret to the wrong prompt. The highest-value secrets go further: since v0.1.1, mnemonics and private keys are accepted **only** via hidden TTY input (`import mnemonic` / `import private-key` / `change-password` have no stdin path at all).

Corollary for scripts: source the piped secret from a secret store, not from a tracked file. See [machine-interface → Secret handling](../machine-interface.md#secret-handling).

## Error output is redaction-safe

Unexpected internal exceptions are collapsed to a generic `internal_error` message before reaching the output envelope, so a third-party library error that happens to echo key material can never leak through a result or a log that captured it.

## Files that contain secrets

`backup` writes secret + metadata with file mode **0600** and never overwrites an existing file. After exporting: move it to your secure storage and treat the file exactly like the key it contains — it is outside wallet-cli's protection from that moment.

## Choosing a key posture

| Posture | Setup | Trade-off |
|---|---|---|
| Software key | `create` / `import` | Convenient; host compromise = key compromise |
| Ledger | `import ledger` | Key never on host; every send confirmed on-device — see [Ledger guide](../guide/ledger.md) |
| Watch-only | `import watch` | No signing at all; safe for monitoring balances of cold storage |
| Split sign/broadcast | `--sign-only` + `tx broadcast` | Signing machine needs no network — see [Scripting](../guide/scripting.md#sign-here-broadcast-there) |

## What wallet-cli cannot do for you

Verify recipients (the chain is irreversible), protect a compromised host's TTY, or secure where you keep the mnemonic and backups. On mainnet, `--dry-run` first is cheap insurance.

## See also

[Accounts & HD](accounts-and-hd.md) · [machine-interface](../machine-interface.md) · [Troubleshooting](../troubleshooting.md)
