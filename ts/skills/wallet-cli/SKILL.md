---
name: wallet-cli
description: Operate a TRON or EVM wallet from the command line — create/import wallets, query balances and history, send native coins and TRC20/ERC20/TRC10 tokens, use GasFree and multi-sig flows, stake resources, vote and govern, manage TRC10 assets and Bancor exchanges, deploy and call contracts, and sign via software or Ledger. Use for TRON or EVM wallet operations when the wallet-cli binary is available.
---

# wallet-cli — agent usage

CLI wallet for TRON and EVM chains, with a machine contract: stable JSON envelopes, deterministic exit codes, and secrets accepted only through stdin flags or hidden TTY prompts.

If `wallet-cli` is not on PATH: `npm install -g @tron-walletcli/wallet-cli` (requires Node.js 20+). Never install the bare npm name `wallet-cli` — that is an unrelated third-party package.

## Invocation rules (always)

1. Always pass `-o json`. Parse stdout as a single JSON object, schema `wallet-cli.result.v1`.
2. Branch on exit code first (`0` ok, `1` execution failure, `2` your call was malformed), then on `error.code`. Never parse `error.message`.
3. Always pass a canonical test network in automation: `--network tron:3448148188` (Nile) or `--network eip155:11155111` (Sepolia). Short aliases such as `nile` and `sepolia` are accepted, but can be re-pointed locally; output always reports the canonical id. `tron:728126428`, `eip155:1`, and `eip155:56` move real funds.
4. The CLI does not read secrets from argv or dedicated secret environment variables. Use stdin flags such as `--password-stdin`; only one `*-stdin` flag may consume stdin per run. Mnemonic/private-key import and `change-password` are interactive-only (hidden TTY input) — hand those to the human; an agent cannot drive them.
5. Do not infer JSON number types. Values backed by `bigint` or protocol int64 amounts are decimal strings; bounded counters and fees such as `blockNumber`, `feeSun`, `energyUsed`, and `netUsed` may be numbers. Follow the command's field table.
6. `--timeout <ms>` bounds every RPC/device call (default 60000).
7. **Discover, don't guess**: `wallet-cli --json-schema` returns the command catalog, including `families`, `inputSchema`, and the maintained `errorCodes` discovery index. The index maps codes to descriptions and is not a closed enum; branch on exit code first and tolerate unknown codes.
8. **Chain families decide what runs.** TRON protocol features (stake, vote, reward, proposal, witness, permission, asset, exchange, GasFree, `account history|activate|set`, `chain params`, `tx approvals|multisig`, and TRON contract governance) fail on EVM with `family_mismatch` (exit 2). Family-scoped flags fail with `invalid_option`: `--asset-id`, `--fee-limit`, `--permission-id`, `--expiration`, `--transaction`, and `--tx-stdin` are TRON-specific; `--gas-limit`, `--max-fee`, `--priority-fee`, and `--nonce` are EVM-specific.
9. A software key-backed account has one address per family (TRON base58 and EVM `0x`); the selected network chooses which one a command uses. Watch-only and Ledger accounts are single-family.
10. Human token and exchange amounts are scaled with decimals or precision supplied by the selected node. When the exact base-unit quantity matters, use `--raw-amount` or the command's `--raw-*` option and inspect the raw quantity before signing.

## Command map

```
create --label <l>                        new HD wallet (BIP39)
import mnemonic|private-key|keystore|ledger|watch  bring in existing accounts
list / use <acct> / current              enumerate & select active account
derive / rename / backup / delete        account lifecycle (backup: secret -> 0600 file in cwd)
backup <acct> --keystore                 export one private key as a Web3 keystore
backup --records                         inspect the local export audit log
address generate                         keypair made locally; NOT added to the wallet
account balance|info|history|portfolio   on-chain state (history needs TronGrid)
account activate --address <T..>         activate a TRON account without transferring funds
account set --name|--id <v>              set a one-time TRON name or id
tx send --to <addr|contact> --amount <n> native coin; add --token SYM | --contract <addr> | --asset-id N (TRON) for tokens
   [--dry-run|--sign-only|--build-only]  estimate / sign to hex / build unsigned hex; never broadcast in these modes
   [--permission-id N] [--expiration ms] TRON permission group / longer signing window
   [--gas-limit N] [--max-fee gwei] [--priority-fee gwei] [--nonce N]  EVM fee controls
tx sign --hex|--file                     sign an artifact (TRON co-signing; one EVM signature)
tx sign --transaction <json>             sign a TRON JSON transaction
tx approvals --hex|--file                TRON signing weight, missing weight, and expiry
tx multisig [--create|--sign <id>|--watch]  collect signatures via the TronLink service
tx broadcast --hex|--file|--transaction|--tx-stdin  presigned hex for either family; JSON is TRON-only
tx status --txid <id>                    state: confirmed|failed|pending|not_found
tx info --txid <id>                      full detail + receipt
permission show|update                   inspect / replace TRON permissions (lockout risk)
gasfree info|transfer|trace              TRON token transfers with fees paid in the token
stake freeze|unfreeze|withdraw|cancel-unfreeze|delegate|undelegate   resource staking
proposal list|show|create|approve|delete  TRON governance proposals
witness create|update|set-brokerage      TRON SR candidacy
asset issue|update|participate|unfreeze|info|list   TRC10 lifecycle
exchange create|inject|withdraw|trade|show|list     TRON protocol Bancor pairs
contract call|send|deploy                read / write / deploy contracts on both families
contract clear-abi|set-origin-energy-limit|set-user-resource-percent  TRON deployer controls
contract create2                         compute a TRON CREATE2 address locally
token / message / typed-data / block     address book, signing, and chain queries
contact add|list|remove                  recipient names usable as --to <name>
encoding convert <value>                 base58 / 41-hex / 0x-EVM / hex / base64 conversions
config / networks                        local config, known networks and aliases
```

Multi-sig: build unsigned (`--build-only`) → each signer `tx sign --file … --out` → check with
`tx approvals` → `tx broadcast` once `thresholdReached` is true. `tx broadcast` refuses a
transaction below its threshold, so branch on `data.thresholdReached`, never on exit code alone.

Details for any command: `wallet-cli <command> --help`.

## Transaction safety (mandatory)

- `tx send` returns at **submission** (`data.stage: "submitted"`, `data.txId`) — that is NOT confirmation.
- Either add `--wait` (blocks until confirmed/failed, capped by `--wait-timeout`), or poll `tx status` until `data.state` is `confirmed`; abort on `failed`; keep polling `pending`/`not_found` within a deadline.
- `confirmed` means included in a block with an execution result or receipt; it does not mean finalized. Use a TRON SolidityNode view or an EVM finalized-block check when finality matters.
- A deadline ending in `pending` or `not_found` is an unknown outcome, not failure. Reconcile it externally and never auto-resend.
- `timeout` or `rpc_error` on a submit path can occur after the node accepted the transaction. Retry read-only calls as appropriate, but reconcile a broadcast by txid (or sender/nonce on EVM) before creating another transaction.
- Chain-assigned ids such as `proposalId`, `assetId`, and `exchangeId` are absent at submission; use `--wait` or query later before consuming them.
- `exchange trade` permits an omitted price floor by submitting `expected = 1` with a warning. An agent must pass `--min-received`, `--raw-min-received`, or `--slippage` unless the user explicitly accepts an effectively unprotected trade.
- Before any mainnet send, confirm with the user and consider `--dry-run` first (builds + estimates, no signature, no broadcast).

## Dangerous commands — require explicit user confirmation

`tx send` / `tx broadcast` / `contract send|deploy` / `gasfree transfer` / `exchange trade|create|inject|withdraw` / `asset participate` on a mainnet (moves funds or burns fees) · `delete` (removes accounts; HD delete cascades from the seed root) · `backup` (writes secret material to disk) · `address generate --print-secret` (writes a private key to stdout).

**`permission update` is the most dangerous command in the CLI** — it replaces the account's entire permission structure, and a structure whose owner group excludes your keys locks the account permanently, with no recovery. Never run it without `--dry-run` first and explicit user confirmation of the rendered structure. Heed `owner_lockout` / `owner_lockout_partial` warnings.

`account activate` and `account set` are one-shot: an account activates once, and the on-chain name and ID can each be set once.

Irreversible TRON operations also require confirmation: `witness create` burns the registration fee; `asset issue` burns the issuance fee and an account can issue only one TRC10; `exchange create` permanently binds liquidity management to the creator; `contract clear-abi` cannot restore the removed ABI.

## Error handling

| exit | error.code | action |
|---|---|---|
| 2 | `usage_error`, `invalid_value` | fix flags; re-read `--help` |
| 1 | `timeout` | retry read-only calls as appropriate; reconcile submit paths before retrying |
| 1 | `rpc_error` | inspect context; reconcile submit paths because the node may have accepted the transaction |
| 2 | `family_mismatch` | switch to a network family supported by the command/account/recipient |
| 2 | `invalid_option` | remove an invalid combination or a flag scoped to the other family |
| 1 | `chain_id_mismatch`, `nonce_too_low` | EVM artifact targets another chain or its nonce is spent; rebuild it |
| 2 | `migration_required` | re-run with an available password source, then re-issue the original command |
| 1 | `internal_error` | do not retry blindly; report |

`wallet-cli --json-schema | jq '.errorCodes'` is the maintained discovery index. Its values are descriptions, not retry instructions. For an unknown code, preserve the exit-code classification.

Full contract: `docs/machine-interface.md` in the wallet-cli repository.
