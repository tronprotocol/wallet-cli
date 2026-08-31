# wallet-cli change-password

Change the master password (re-encrypt all software wallet keystores).

## Synopsis

```
wallet-cli change-password [--yes]
```

## Description

The master password decrypts **every software wallet's** keystore, so changing it means: verify the old password, set a new one, then decrypt-and-re-encrypt every software keystore atomically. Ledger and watch-only accounts hold no secrets and are unaffected.

**Interactive-only**: old password, new password, and confirmation are all hidden TTY prompts. There is no stdin or argv path — the command handles two high-value secrets at once and runs rarely, so nothing may pass through pipes, shell history, or the process list. Without a TTY it fails with `tty_required`.

The flow:

1. **Verify** — enter the current master password; it must decrypt an existing keystore (`auth_failed` otherwise, nothing touched).
2. **Set** — enter the new password twice. A mismatch or policy failure is rejected at the prompt and asks again.
3. **Confirm** — the command lists how many software wallets will be re-encrypted; `[y/N]` (skipped with `--yes`). Declining aborts with no changes.
4. **Re-encrypt atomically** — each keystore: decrypt with old → encrypt with new → write temp file → fsync; only after *all* succeed are files renamed into place. Any failure rolls everything back and reports `io_error` — the old keystores stay valid.

## Options

| Option | Description |
|---|---|
| `--yes` | Skip the final confirmation prompt (step 3) |

Plus the [global options](index.md#global-options-every-command).

## Examples

```bash
wallet-cli change-password
```

```console
? Current master password (hidden):
? New master password (hidden):
? Confirm new password (hidden):
? Re-encrypt 3 software wallet(s) with the new password? [y/N]: y
✅ Master password changed — re-encrypted 3 software wallet(s)
  Wallets  wallet1, wallet2, imported-1

⚠️ Ledger / watch-only accounts have no secrets and are unaffected.
```

## Output

This command is interactive. In text mode, the receipt lists the re-encrypted software wallets and never includes secret material. In JSON mode, `data.wallets` contains those wallet labels/ids and `data.count` contains their count. Local command — no `chain` block.

## Exit status

`0` changed · `1` execution failure (`auth_failed`; `no_software_wallet` — nothing to re-encrypt; `invalid_value` — a referenced encrypted wallet blob is missing; `io_error` — write failed, rolled back) · `2` usage error (`tty_required` — no TTY for interactive input; `invalid_value` — the new password equals the current one; `aborted` — confirmation declined).

## See also

[`backup`](backup.md) · [Security model](../concepts/security.md) · [machine-interface → Secret handling](../machine-interface.md#secret-handling)
