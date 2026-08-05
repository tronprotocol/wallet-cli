---
name: wallet-cli
description: Operate a TRON wallet from the command line — create/import wallets, query balances and history, send TRX/TRC20/TRC10, check transaction status, stake resources, and sign via software or Ledger. Use for any TRON wallet operation when the wallet-cli binary is available.
---

# wallet-cli — agent usage

TRON CLI wallet with a machine contract: stable JSON envelopes, deterministic exit codes, secrets via stdin only.

If `wallet-cli` is not on PATH: `npm install -g @tron-walletcli/wallet-cli` (requires Node.js 20+). Never install the bare npm name `wallet-cli` — that is an unrelated third-party package.

## Invocation rules (always)

1. Always pass `-o json`. Parse stdout as a single JSON object, schema `wallet-cli.result.v1`.
2. Branch on exit code first (`0` ok, `1` execution failure, `2` your call was malformed), then on `error.code`. Never parse `error.message`.
3. Always pass `--network tron:nile` for tests; `tron:mainnet` moves real funds.
4. Secrets go through stdin flags (`--password-stdin`), never argv/env. Only one `*-stdin` flag per run. Mnemonic/private-key import and `change-password` are interactive-only (hidden TTY input) — hand those to the human; an agent cannot drive them.
5. All on-chain amounts in JSON are decimal strings — do not treat as numbers.
6. `--timeout <ms>` bounds every RPC/device call (default 60000).

## Command map

```
create --label <l>                        new HD wallet (BIP39)
import mnemonic|private-key|ledger|watch  bring in existing accounts
list / use <acct> / current              enumerate & select active account
derive / rename / backup / delete        account lifecycle (backup: secret, file mode 0600)
address generate                         keypair made locally; NOT added to the wallet
account balance|info|history|portfolio   on-chain state (history needs TronGrid)
account activate --address <addr>        activate a new account (payer = active account)
account set --name <n> | --id <n>        one-time on-chain name/ID — effectively immutable
tx send --to <addr|contact> --amount <n> TRX; add --token SYM | --contract Txx | --asset-id N for tokens
   [--dry-run|--sign-only|--build-only]  estimate only / sign / build unsigned, no broadcast
tx sign --transaction <json>             sign JSON built elsewhere
tx sign --file <hex> [--check] [--out]   append a signature to a multi-sig artifact (--check verifies online)
tx approvals --file <hex>                who signed, weight so far, missing weight, expiry
tx multisig [--create|--sign <id>|--watch]  collect signatures via the TronLink service
tx broadcast --tx-stdin|--hex|--file     broadcast a presigned tx; --dry-run validates only
tx status --txid <id>                    state: confirmed|failed|pending|not_found
tx info --txid <id>                      full detail + receipt
permission show                          owner/witness/active groups, thresholds, decoded ops
permission update --file <json>          replace the WHOLE permission structure (lockout risk)
gasfree info|transfer|trace              send tokens with no TRX; fee paid in the token
stake freeze|unfreeze|withdraw|cancel-unfreeze|delegate|undelegate   resource staking
token / contract / message / block       address book, smart contracts, signing, blocks
contact add|list|remove                  recipient names usable as --to <name>
encoding convert <value>                 base58 / 41-hex / 0x-EVM / hex / base64 conversions
config / networks                        local config, known networks
```

Multi-sig: build unsigned (`--build-only`) → each signer `tx sign --file … --out` → check with
`tx approvals` → `tx broadcast` once `thresholdReached` is true. `tx broadcast` refuses a
transaction below its threshold, so branch on `data.thresholdReached`, never on exit code alone.

Details for any command: `wallet-cli <command> --help`.

## Transaction safety (mandatory)

- `tx send` returns at **submission** (`data.stage: "submitted"`, `data.txId`) — that is NOT confirmation.
- Either add `--wait` (blocks until confirmed/failed, cap `--wait-timeout`), or poll `tx status` until `data.state` is `confirmed`; abort on `failed`; `pending`/`not_found` mean keep polling within your own deadline.
- Before any mainnet send: confirm with the user; consider `--dry-run` first (builds + estimates, no signature, no broadcast).

## Dangerous commands — require explicit user confirmation

`tx send` / `tx broadcast` / `contract send|deploy` / `gasfree transfer` on `tron:mainnet` (moves funds) · `delete` (removes accounts; HD delete cascades from the seed root) · `backup` (writes secret material to disk) · `address generate --print-secret` (writes a private key to stdout).

**`permission update` is the most dangerous command in the CLI** — it replaces the account's entire permission structure, and a structure whose owner group excludes your keys locks the account permanently, with no recovery. Never run it without `--dry-run` first and explicit user confirmation of the rendered structure. Heed `owner_lockout` / `owner_lockout_partial` warnings.

`account activate` and `account set` are one-shot: an account activates once, and the on-chain name and ID can each be set once.

## Error handling

| exit | error.code | action |
|---|---|---|
| 2 | `usage_error`, `invalid_value` | fix flags; re-read `--help` |
| 1 | `timeout` | retry with higher `--timeout`; check network/proxy |
| 1 | `rpc_error` | node rejected: inspect message for context, verify txid/address/funds |
| 1 | `internal_error` | do not retry blindly; report |

Full contract: `docs/machine-interface.md` in the wallet-cli repository.
