# Troubleshooting

Remedies for humans, keyed by the [error codes](machine-interface.md#error-codes) defined in the machine interface (the single authority on what each code *is* — this page only covers what to *do*). For a code not covered here, the complete one-line index is `wallet-cli --json-schema | jq '.errorCodes'`.

## `usage_error` / `invalid_value` (exit 2)

The command was malformed — a flag is unknown, missing, conflicting, or has a bad value.

- Re-run with `--help` on the exact subcommand: `wallet-cli tx send --help`.
- Common conflicts: `--amount` vs `--raw-amount`; `--token` vs `--contract` vs `--asset-id`; `--dry-run` vs `--sign-only`; two `*-stdin` flags in one run.
- Common conflicts continued: `--constructor-args` vs `--constructor-params`, and `--artifact` vs `--code` vs `--code-file` on `contract deploy`.
- `invalid_value` on `config`: check the allowed keys (`defaultNetwork`, `defaultOutput`, `timeoutMs`, `waitTimeoutMs`, `networks`, `aliases`, `networks.<id>.{httpEndpoint|apiKeyHeader|apiKey}`) and values (`defaultOutput` is `text` or `json`).

## `family_mismatch` (exit 2)

The command, the account, or the transaction does not belong to the selected network's chain family — for example `stake freeze --network sepolia`, or a TRON-only watch-only account used on an EVM network.

- Check which family the command serves: `wallet-cli <command> --help` names it, and [the command reference](commands/index.md#which-commands-run-on-which-networks) lists every TRON-only command.
- Check which network you actually selected — with `--network` omitted it is `config.defaultNetwork`. `wallet-cli config defaultNetwork` shows it.
- If the account is the mismatch: a seed or private-key account works on both families, but a **watch-only or Ledger account has one address and one family**. `wallet-cli list -o json` shows each account's `addresses` and its `family`.

## `invalid_option`: "a tron option on this command" (exit 2)

A flag that belongs to the other chain family. `--asset-id`, `--fee-limit`, `--permission-id`, `--expiration`, `--transaction` and `--tx-stdin` are TRON's; `--gas-limit`, `--max-fee`, `--priority-fee` and `--nonce` are EVM's. `--help` tags each one `(tron only)` / `(evm only)`.

`--max-fee` / `--priority-fee` additionally need an **EIP-1559** chain; on a network that still prices in `gasPrice` they are refused with the same code.

## `chain_id_mismatch` / `nonce_too_low` (exit 1)

EVM-only, both about a transaction that cannot go where you are sending it.

- `chain_id_mismatch` — the signed transaction was built for another chain. The chain id is inside the transaction and is what the signature commits to, so it cannot be retargeted; rebuild it against the network you want. This check runs **before** signing too, so you cannot sign a mainnet transaction by pointing `tx sign` at a testnet.
- `nonce_too_low` — the account has already mined a transaction at that nonce. Rebuild without `--nonce` to take the account's pending nonce, or pass the correct one.

A nonce that is *ahead* of the account's next one is not an error: it is a `meta.warnings` entry, and the transaction sits queued until the gap is filled.

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
- Ledger: confirm the device is unlocked and the app matching the account's family is open (TRON app or Ethereum app), then retry.
- **If this happened on `tx send`**: the transaction may still have been submitted. Recover the txid if you have it and check `tx status` before resending.

## `rpc_error` (exit 1)

The node accepted the connection but rejected the request. The message carries the node's reason — a TRON API call (`TRON getTransaction failed: Transaction not found`) or a JSON-RPC method (`eth_estimateGas failed: …`).

- *Transaction not found*: wrong `--txid`, wrong `--network` (a Nile txid queried on mainnet), or the tx hasn't propagated yet — retry after a few seconds.
- *Insufficient balance / bandwidth / energy*: fund the account, or stake for resources (`stake freeze`) — see [Networks](concepts/networks.md) for how resources work; on Nile use the faucet.
- TRC20 send reverting: raise `--fee-limit` (default 100000000 SUN) only after confirming the recipient/contract is correct.
- *`eth_estimateGas` failed*: the node simulated the transaction and it reverted — most often an unfunded account, or a call the contract rejects. Fix the cause; `--gas-limit` proceeds without an estimate, but a transaction that reverts in simulation will usually revert on chain too, paying the gas anyway.

## `internal_error` (exit 1)

An unexpected failure. The message is intentionally generic (secret-redaction). Re-run with `--verbose` for stderr diagnostics; if reproducible, file an issue with the command shape (never include secrets).

## Not an error code, but frequently asked

- **`tx status` says `pending` for a long time** — the tx is seen but not solidified; keep polling. If it never leaves `pending`/`not_found` past your deadline, treat it as failed and investigate on a block explorer before resending.
- **"only one *-stdin flag can consume stdin per run"** — pipe one secret per invocation; for send-with-password use `--password-stdin` and let the mnemonic/key live in the encrypted store.
- **Forgot the master password** — there is no recovery; restore from your BIP39 mnemonic (`import mnemonic`) into a fresh wallet and set a new password.
- **`account history` fails while other queries work** — history requires a TronGrid endpoint; plain node RPC is not enough. It is also TRON-only: on an EVM network it fails with `family_mismatch`.
- **`list` does not show an account I know exists** — text output shows one chain family at a time and warns how many it left out. Pass `--network` for the other family, or `-o json`, which lists every account with every address.
- **`tx status` returns `not_found` on EVM for a transaction that definitely happened** — public RPC endpoints often prune history. The warning in `meta.warnings` says so; try an archival endpoint (`config networks.<id>.httpEndpoint`).
- **A command exits 0 with `command: "migration"` instead of doing anything** — persisted wallet data was upgraded first and the original command was deliberately not run. Re-run it. See [startup wallet-data upgrades](machine-interface.md#startup-wallet-data-upgrades).
