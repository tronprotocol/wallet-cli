# Troubleshooting

Remedies for humans, keyed by the [error codes](machine-interface.md#error-codes) defined in the machine interface (the single authority on what each code *is* — this page only covers what to *do*).

## `usage_error` / `invalid_value` (exit 2)

The command was malformed — a flag is unknown, missing, conflicting, or has a bad value.

- Re-run with `--help` on the exact subcommand: `wallet-cli tx send --help`.
- Common conflicts: `--amount` vs `--raw-amount`; `--token` vs `--contract` vs `--asset-id`; `--dry-run` vs `--sign-only`; two `*-stdin` flags in one run.
- `invalid_value` on `config`: check the allowed keys (`defaultNetwork`, `defaultOutput`, `timeoutMs`, `waitTimeoutMs`, `networks`) and values (`defaultOutput` is `text` or `json`).

## `weak_password` (exit 2)

`create` (and other password-setting commands) rejected the master password. It must be **at least 8 characters** and include an **uppercase letter, a lowercase letter, a digit, and a special character** (`!@#$%^&*()-_=+[]{};:,.?`). The error message names the specific rule you missed.

## `tty_required` / `auth_required` (exit 2 / exit 1)

A secret was needed but none could be read.

- `tty_required` — no terminal is attached (CI, pipes). For commands with a stdin path, provide the matching `*-stdin` flag (`--password-stdin`, `--tx-stdin`). `import mnemonic`, `import private-key`, and `change-password` are interactive-only — they must run in a real TTY; there is no non-interactive alternative.
- `auth_required` — the command needs the master password; pass `--password-stdin` or run it interactively.
- `auth_failed` — the password was wrong (decryption failed); re-enter it.

## `timeout` (exit 1)

The node or the Ledger device didn't answer within `--timeout` (default 60000 ms).

- Check basic connectivity to the network; if you are behind a proxy, verify the CLI's traffic actually goes through it.
- Raise the bound: `--timeout 120000`.
- Ledger: confirm the device is unlocked and the TRON app is open, then retry.
- **If this happened on `tx send`**: the transaction may still have been submitted. Recover the txid if you have it and check `tx status` before resending.

## `rpc_error` (exit 1)

The TRON node accepted the connection but rejected the request. The message carries the node's reason, e.g. `TRON getTransaction failed: Transaction not found`.

- *Transaction not found*: wrong `--txid`, wrong `--network` (a Nile txid queried on mainnet), or the tx hasn't propagated yet — retry after a few seconds.
- *Insufficient balance / bandwidth / energy*: fund the account, or stake for resources (`stake freeze`) — see [Networks](concepts/networks.md) for how resources work; on Nile use the faucet.
- TRC20 send reverting: raise `--fee-limit` (default 100000000 SUN) only after confirming the recipient/contract is correct.

## `internal_error` (exit 1)

An unexpected failure. The message is intentionally generic (secret-redaction). Re-run with `--verbose` for stderr diagnostics; if reproducible, file an issue with the command shape (never include secrets).

## Not an error code, but frequently asked

- **`tx status` says `pending` for a long time** — the tx is seen but not solidified; keep polling. If it never leaves `pending`/`not_found` past your deadline, treat it as failed and investigate on a block explorer before resending.
- **"only one *-stdin flag can consume stdin per run"** — pipe one secret per invocation; for send-with-password use `--password-stdin` and let the mnemonic/key live in the encrypted store.
- **Forgot the master password** — there is no recovery; restore from your BIP39 mnemonic (`import mnemonic`) into a fresh wallet and set a new password.
- **`account history` fails while other queries work** — history requires a TronGrid endpoint; plain node RPC is not enough.
