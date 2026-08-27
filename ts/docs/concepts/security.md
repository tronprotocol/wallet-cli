# Security Model

What wallet-cli protects, how, and what remains your job.

## Local storage

All secrets (seeds, private keys) are stored **encrypted under your master password**; nothing usable is on disk in the clear. Metadata (labels, addresses) is readable without unlock — that's why `list` needs no password but `tx send` does.

The master password is local protection only: it is never sent anywhere and **cannot be recovered**. It must be at least 8 characters with an uppercase letter, a lowercase letter, a digit, and a special character.

The recovery object is the BIP39 mnemonic, but `create` never prints it — the seed is stored encrypted. Run [`backup`](../commands/backup.md) to export the plaintext mnemonic to a `0600` file and keep that file offline. Lose both password and backup and the funds are gone; lose only the password and `import mnemonic` (using the phrase from your backup) restores everything.

One seed covers **every chain family** — the same phrase re-derives your TRON and your EVM addresses alike — so there is one thing to back up, not one per chain.

## Secrets in transit: stdin or TTY, never argv/env

Anything in a command's arguments or environment leaks into shell history, `ps` output, and CI logs. wallet-cli therefore refuses secrets there — they enter only via:

- interactive TTY prompts, or
- explicit stdin flags: `--password-stdin`, `--tx-stdin` — **one `*-stdin` flag per run**, so a pipeline can never silently feed the wrong secret to the wrong prompt. The highest-value secrets go further: mnemonics and private keys are accepted **only** via hidden TTY input (`import mnemonic` / `import private-key` / `change-password` have no stdin path at all).

Corollary for scripts: source the piped secret from a secret store, not from a tracked file. See [machine-interface → Secret handling](../machine-interface.md#secret-handling).

## Chain data cannot repaint your terminal

Several fields you read before approving something are written by whoever put them on chain, or by a third-party service — permission names, token names and symbols, co-signer labels. In text mode every output frame is neutralised before it reaches the terminal: ANSI/OSC control bytes are stripped, and invisible formatting characters are replaced by a visible escape such as `<U+202E>`.

That escape matters. `U+202E` reverses the display order of everything after it, which would let a permission name change how the address or weight printed beside it appears; zero-width characters can make two different names render identically. `<U+200B>` or `<U+202E>` appearing in a name means the underlying string really contains it — a red flag, not a rendering glitch. Ordinary right-to-left text (Arabic, Hebrew) contains no such characters and displays normally.

JSON output is never rewritten: machine consumers receive the bytes as they arrived and neutralise them themselves before display.

## Error output is redaction-safe

Unexpected internal exceptions are collapsed to a generic `internal_error` message before reaching the output envelope, so a third-party library error that happens to echo key material can never leak through a result or a log that captured it.

## Files that contain secrets

`backup` writes secret + metadata with file mode **0600** and never overwrites an existing file. After exporting: move it to your secure storage and treat the file exactly like the key it contains — it is outside wallet-cli's protection from that moment. The native format holds the seed and therefore every family's key; `backup --keystore` holds a **single private key**, and `--network` chooses which family's — a keystore exported for one family gives no access to the other.

`config.yaml` is a second file that can hold secrets, once you configure service credentials or an endpoint API key. wallet-cli checks it: if it holds credentials and is a symlink or group/world-readable, commands fail with `insecure_config` rather than reading it. `chmod 600` it. Secrets in it are always rendered masked (`********`), and endpoint URLs are trimmed to their host in listings, since a commercial RPC URL can carry a key in its path.

## Choosing a key posture

| Posture | Setup | Trade-off |
|---|---|---|
| Software key | `create` / `import` | Convenient; host compromise = key compromise |
| Ledger | `import ledger` | Key never on host; every send confirmed on-device. `--app` fixes the account to one chain family — import once per app to cover both — see [Ledger guide](../guide/ledger.md) |
| Watch-only | `import watch` | No signing at all; safe for monitoring balances of cold storage. Bound to the pasted address's family |
| Split sign/broadcast | `--sign-only` + `tx broadcast` | Signing machine needs no network — see [Scripting](../guide/scripting.md#sign-here-broadcast-there) |

## What wallet-cli cannot do for you

Verify recipients (the chain is irreversible), protect a compromised host's TTY, or secure where you keep the mnemonic and backups. It also cannot tell you that a TRON address and an EVM address derived from the same seed are *yours* on a chain you have never funded — they are valid addresses either way. On mainnet, `--dry-run` first is cheap insurance.

## See also

[Accounts & HD](accounts-and-hd.md) · [machine-interface](../machine-interface.md) · [Troubleshooting](../troubleshooting.md)
