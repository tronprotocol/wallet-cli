# Troubleshooting

Remedies for humans, keyed by the [error codes](machine-interface.md#error-codes) defined in the machine interface (the single authority on what each code *is* — this page only covers what to *do*). For a code not covered here, the maintained discovery index is `wallet-cli --json-schema | jq '.errorCodes'`; still fall back to the exit-code class if a runtime envelope carries a code outside that catalog.

## `migration_required` (exit 2)

Your local wallet data was written by an older version and has to be upgraded before a command that uses it can run. The upgrade gate runs ahead of the command you typed, and that command is deliberately not executed. `--help`, `--version`, `--json-schema`, and a bare `wallet-cli` never read wallet data, so they skip the gate.

- **At a terminal**: re-run it. The gate asks for consent first, then for the master password when the upgrade has to re-derive account data.
- **Non-interactive (CI, pipes)**: pass `--password-stdin`. Ledger-only and watch-only wallets hold no secret to re-encrypt and upgrade without a password; a wallet holding a seed or a private key needs one, and this code is what you get when it is missing.
- **Declining is not a failure**: exit `0` with `upgraded: false` and `cancelled: true`, and nothing is written — no upgraded file, no backup.
- The pre-upgrade file is kept beside the original as `<name>.v1.bak`, permanently. The upgrade runs once.

The full behaviour, including the `migration` result envelope, is in [startup wallet-data upgrades](machine-interface.md#startup-wallet-data-upgrades).

## `encoding_error`: an account this build cannot read (exit 1)

The opposite direction of `migration_required` — a wallet registry written by a **newer** wallet-cli, holding an account whose storage kind this build has no reader for.

- [`list`](commands/list.md) degrades instead of failing: it shows every account it can read and warns, naming the wallet ids it skipped. The address scan behaves the same way, so an address you can still see keeps resolving.
- Naming an unreadable account — `--account`, or by label or address — is refused with `encoding_error` **before the command acts**, so nothing is written and no receipt is half-built.
- The remedy is to upgrade wallet-cli to a version that understands the format. Nothing local is corrupt.

## `legacy_derivation` (exit 1)

The account is a TRON account #1 or later in a wallet created before 4.13.1, and uses a derivation path this version no longer signs with. The same error stops `derive` from adding accounts to that wallet. Nothing is lost: follow [Recover addresses after `legacy_derivation`](troubleshooting/legacy-derivation-recovery.md) **before deleting anything**.

## `derivation_mismatch` (exit 1)

An address stored in `wallets.json` matches no derivation path of its seed, so the wallet file and the encrypted vault disagree — typically an edited file or one copied from another wallet. Restore the files from your own copy, or rebuild the wallet from its recovery phrase.

## `usage_error` / `invalid_value` (exit 2)

The command was malformed — a flag is unknown, missing, conflicting, or has a bad value. All of these exit 2, but the codes differ: `invalid_option` for an unknown or wrongly combined flag, `missing_option` for an absent required one, `invalid_value` for a bad value, and `usage_error` only when the parser itself rejects the line.

- Re-run with `--help` on the exact subcommand: `wallet-cli tx send --help`.
- Common conflicts: `--amount` vs `--raw-amount`; `--token` vs `--contract` vs `--asset-id`; `--dry-run` vs `--sign-only`; `--constructor-args` vs `--constructor-params`; `--artifact` vs `--code` vs `--code-file` on `contract deploy`; two `*-stdin` flags in one run.
- `invalid_value` on `config`: check the allowed keys (`defaultNetwork`, `defaultOutput`, `timeoutMs`, `waitTimeoutMs`, `networks`, `aliases`, `networks.<id>.{httpEndpoint|apiKeyHeader|apiKey}`, and the credential keys `gasfreeApiKey`, `gasfreeApiSecret`, `tronlinkSecretId`, `tronlinkSecretKey`, `tronlinkChannel`, `baiApiKey`) and values (`defaultOutput` is `text` or `json`).

## `family_mismatch` (exit 2)

The command, the account, or the transaction does not belong to the selected network's chain family — for example `stake freeze --network sepolia`, or a TRON-only watch-only account used on an EVM network.

- Check which family the command serves: `wallet-cli <command> --help` names it, and [the command reference](commands/index.md#which-commands-run-on-which-networks) lists every TRON-only command.
- Check which network you actually selected — with `--network` omitted it is `config.defaultNetwork`. `wallet-cli config defaultNetwork` shows it.
- If the account is the mismatch: a seed or private-key account works on both families, but a **watch-only or Ledger account has one address and one family**. `wallet-cli list -o json` shows each account's `addresses` and its `family`.

## `invalid_option`: a flag scoped to the other family (exit 2)

The flag exists, but belongs to the other chain family — `--asset-id` or `--permission-id` on an EVM network, `--gas-limit` or `--nonce` on a TRON one. `--help` tags each flag `(TRON only)` / `(EVM only)`.

- Fees: `--fee-limit` is TRON's; `--gas-limit` / `--max-fee` / `--priority-fee` / `--nonce` are EVM's.
- `--max-fee` / `--priority-fee` are also refused on an EVM chain that still prices in a single `gasPrice`; check the `feeModel` from [`chain prices`](commands/chain/prices.md).
- Transaction JSON (`--transaction`, `--tx-stdin`) is TRON's; use `--file` / `--hex` in scripts that may target either family.

## `chain_id_mismatch` / `nonce_too_low` (exit 1)

An EVM transaction that was signed elsewhere cannot go to this network as-is.

- `chain_id_mismatch` — the transaction commits to a different chain id than the one `--network` selected. The signature covers that chain id, so it cannot be re-pointed: rebuild the transaction against the intended network.
- `nonce_too_low` — the account has already mined a transaction at that nonce. Rebuild with the current pending nonce (the default when `--nonce` is omitted), or pass the next free one explicitly.
- The same code answers a **build-path dry run**: `tx send`, `contract send` and `contract deploy` with `--dry-run` and an explicit `--nonce` read the account's mined count and refuse a spent nonce before estimating gas, rather than reporting a fee plan for a transaction that can never be mined. The read is best-effort — a dry run that cannot reach the node still builds — and it happens only in that combination, since a derived nonce is the pending count and cannot be behind. A nonce below *pending* but not yet mined is allowed: that is a legitimate replacement of a transaction still in the mempool.
- A nonce *ahead* of the account's next one is only a `meta.warnings` entry in `tx broadcast --dry-run`, which compares it against the account's nonce read from the node (and degrades to a `skipped` check with a warning if that read fails). On a real broadcast the node decides: a rejected gap comes back as `nonce_too_high` at exit 1; if it accepts, the transaction sits queued until the gap is filled.

## `weak_password` (exit 2)

`create` (and other password-setting commands) rejected the master password. It must be **at least 8 characters** and include an **uppercase letter, a lowercase letter, a digit, and a special character** (`!@#$%^&*()-_=+[]{};:,.?`). The error message names the specific rule you missed.

## `tty_required` / `auth_required` (exit 2 / exit 1)

A credential, secret, or signing-device approval was needed but none was available.

- `tty_required` — no terminal is attached (CI, pipes). For commands with a stdin path, provide the matching `*-stdin` flag (`--password-stdin`, `--tx-stdin`). `import mnemonic`, `import private-key`, and `change-password` are interactive-only — they must run in a real TTY; there is no non-interactive alternative.
- `auth_required` — the command needs the master password; pass `--password-stdin` or run it interactively.
- `auth_failed` — the password was wrong (decryption failed); re-enter it.

## `timeout` (exit 1)

The node or the Ledger device didn't answer within `--timeout` (default 60000 ms).

- Check basic connectivity to the network; if you are behind a proxy, verify the CLI's traffic actually goes through it.
- Raise the bound: `--timeout 120000`.
- Ledger: confirm the device is unlocked and the app the account was registered with (`--app tron` or `--app ethereum`) is open, then retry.
- **If this happened on `tx send`**: the transaction may still have been submitted. Recover the txid if you have it and check `tx status` before resending.

## `rpc_error` (exit 1)

The node accepted the connection but rejected the request — a TRON API call, or an EVM JSON-RPC method such as `eth_estimateGas`. The message carries the node's reason, e.g. `TRON getTransaction failed: Transaction not found`.

- *Transaction not found*: wrong `--txid`, wrong `--network` (a Nile txid queried on mainnet), or the tx hasn't propagated yet — retry after a few seconds.
- *Insufficient balance / bandwidth / energy*: fund the account, or stake for resources (`stake freeze`) — see [Networks](concepts/networks.md) for how resources work; on Nile use the faucet.
- *TRC20 send reverting* (`estimateEnergy failed: REVERT opcode executed`): work through it in this order — (1) **the token balance is too low** for the amount you asked for, by far the most common cause: check it with `token balance --contract <address>`, and remember a TRX faucet does not give you tokens; (2) the recipient or the contract address is wrong; (3) only once both are ruled out, consider raising `--fee-limit` (default 100000000 SUN) — raising it does not fix an insufficient balance, it only lets a genuinely expensive call through.

## `internal_error` (exit 1)

An unexpected failure. The message is intentionally generic (secret-redaction). Re-run with `--verbose` for stderr diagnostics; if reproducible, file an issue with the command shape (never include secrets).

## Not an error code, but frequently asked

- **`tx status` says `pending` for a long time** — the node has seen the transaction but has no execution result yet; keep polling. A deadline that ends in `pending` or `not_found` is an *unknown* outcome, not a failure: reconcile the txid against the intended network on a block explorer before resending, since a resend builds and signs a new transaction rather than retrying the old one.
- **"only one *-stdin flag can consume stdin per run"** — pipe one secret per invocation; for send-with-password use `--password-stdin` and let the mnemonic/key live in the encrypted store.
- **Forgot the master password** — there is no recovery; restore from your BIP39 mnemonic (`import mnemonic`) into a fresh wallet and set a new password.
- **`account history` fails while other queries work** — history requires a TronGrid endpoint; plain node RPC is not enough.
