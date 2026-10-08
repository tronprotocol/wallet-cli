# Machine Interface

The formal contract for calling wallet-cli from scripts, CI pipelines, and AI agents. This page is the **single authority** for the JSON envelope, exit codes, error codes, and secret handling. Everything here is covered by the `wallet-cli.result.v1` stability promise unless explicitly marked otherwise.

## Calling convention

```bash
wallet-cli <command> -o json [--network <id|alias>] [--timeout <ms>] [--account <id|label>]
```

- Always pass `-o json`. Text output is for humans and carries no stability promise.
- In JSON mode, stdout carries **exactly one terminal frame** — the result envelope. Nothing else is ever written to stdout. Diagnostics go to stderr.
- Long-running `x402` and `bai` commands also report progress on stderr: `⏳ …` lines in text mode, and one `{"type":"activity","message":"…"}` line per step in JSON mode. They are informational — ignore them or show them to a user, but never parse them for the outcome.
- Every RPC / device call is bounded by `--timeout` (milliseconds, default `config.timeoutMs`, built-in 60000).
- `--network` takes a canonical **CAIP-2** id (`tron:3448148188`, `eip155:11155111`) or a short alias (`nile`, `sepolia`, `bsc`). The namespace is not the chain family: `eip155` addresses the `evm` family. Aliases resolve once at selection; nothing downstream ever sees one, and the envelope's `chain.network` always reports the canonical id. Prefer canonical ids in scripts — an alias is a local config entry and can be re-pointed.
- The TRON ids used before CAIP-2 (`tron:mainnet`, `tron:nile`, `tron:shasta`) remain permanent aliases, so existing invocations keep working. **Output is a different matter**: `chain.network`, `chain.chainId`, the `networks` listing's `id`, and the `config` keys all report the CAIP-2 id now, so a consumer that string-matches or keys a map by `tron:nile` must be updated.

### Discovery

```bash
wallet-cli --json-schema
```

```bash
wallet-cli --json-schema tron
```

```bash
wallet-cli tx send --json-schema
```

One call returns the whole surface: `tool`, `version`, `globalFlags`, `errorCodes`, and `commands[]`. Command entries carry `id`, `kind`, `path`, `usage`, `summary`, `requires` (network / auth / wallet), `capability`, `examples`, and `inputSchema`, a JSON Schema for their input; chain commands also declare `families`. This is the intended way to learn the CLI; do not scrape `--help`. A family argument scopes the catalog to one chain family.

### Chain families

A network belongs to one **chain family**, `tron` or `evm`, and that is what decides which commands and which flags apply:

- A command declares the families it serves (`families` in the catalog). Calling one on a network of another family fails with **`family_mismatch`** at exit `2`, before any node call.
- A flag may belong to one family too (`--asset-id` and `--permission-id` are TRON's, `--gas-limit` and `--nonce` are EVM's). Using one on the other family is **`invalid_option`** at exit `2`. `--help` tags them `(TRON only)` / `(EVM only)`.
- An **account** is not family-bound when it holds a key — a seed or private-key account has both a TRON and an EVM address. Watch-only and Ledger accounts hold one address and therefore one family; selecting one on a mismatched network is also `family_mismatch`.

Command-family and flag-family checks are static — they depend on the command, the flags, and the selected network only — so an agent can decide them from the catalog without a call. Account-family compatibility also depends on the selected wallet account: key-backed accounts serve both families, while watch-only and Ledger accounts are bound to one.

### Startup wallet-data upgrades

Every command checks the persisted wallet schema before it runs. `--help`, `--version`, `--json-schema`, and a bare `wallet-cli` are the exception: they never read wallet data, so they skip this check. If the schema is stale, the startup gate upgrades it first and **the command you typed is deliberately not run**. Progress goes to stderr; the result is a single success envelope at exit `0` whose `command` is `migration`:

| Field | Meaning |
|---|---|
| `upgraded` | `true` when files were rewritten, `false` when the user declined |
| `cancelled` | `true` only on a declined upgrade |
| `files[]` | `path`, `from`, `to`, and `backup` (the backup is absent on a declined upgrade, since nothing was written) |
| `originalCommandExecuted` | always `false` — re-run your command after inspecting this result |

Ending the invocation at that boundary is what keeps a scripted or fund-moving command from continuing across an unexpected durable-state change.

In an interactive terminal the upgrade asks for consent first. Seed and private-key migrations then ask for the master password; Ledger and watch-only migrations proceed without one. Non-interactive Ledger/watch-only migrations are automatic, while a password-bearing one needs `--password-stdin` or fails with `migration_required` at exit `2` — the invocation itself has to change, so it is a usage error, and the code is reserved for an upgrade that *cannot* proceed. Declining is not a failure: it is exit `0` with `upgraded: false`, `cancelled: true`, and no file or backup written.

## Exit codes

| Code | Meaning | Envelope |
|---|---|---|
| `0` | Success | `success: true` |
| `1` | Execution failure — runtime error: RPC failure, timeout, chain rejection, wallet error | `success: false` |
| `2` | Usage error — bad flags, missing required option, invalid value, family mismatch | `success: false` |

The mapping is fixed and exhaustive. A non-zero exit always comes with an error envelope on stdout (JSON mode).

## The result envelope

Schema id: `wallet-cli.result.v1`.

**Success:**

```json
{
  "schema": "wallet-cli.result.v1",
  "success": true,
  "command": "account.balance",
  "data": { "address": "TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ", "balance": "1976489000", "decimals": 6, "symbol": "TRX" },
  "meta": { "durationMs": 1114, "warnings": [] },
  "chain": { "family": "tron", "network": "tron:3448148188", "chainId": "3448148188" }
}
```

**Error:**

```json
{
  "schema": "wallet-cli.result.v1",
  "success": false,
  "command": "tx.info",
  "error": { "code": "rpc_error", "message": "TRON getTransaction failed: Transaction not found" },
  "meta": { "durationMs": 1033, "warnings": [] },
  "chain": { "family": "tron", "network": "tron:3448148188", "chainId": "3448148188" }
}
```

| Field             | Type                     | Presence            | Notes                                                                            |
| ----------------- | ------------------------ | ------------------- | -------------------------------------------------------------------------------- |
| `schema`          | `"wallet-cli.result.v1"` | always              | Version gate; dispatch on this                                                   |
| `success`         | boolean                  | always              | Mirrors the exit code (`true` ⇔ 0)                                               |
| `command`         | string                   | always              | Canonical command id, e.g. `tx.send`, `list`. It names the **operation**, not the words typed: `backup --records` reports `backup.records`, `import keystore` reports `import.keystore` |
| `data`            | object/array             | success only        | Command-specific payload; see each command's reference page                      |
| `error.code`      | string                   | error only          | Machine-readable; see [error codes](#error-codes)                                |
| `error.message`   | string                   | error only          | Human-readable; **not** stable — never parse it. When a chain rejection was classified into a code, this reads `<category>: <what the node said>`, so the terminal shows the node's own numbers or revert reason; the same node text is also in `details.nodeMessage` (TRON, redacted) or `details.providerMessage` (TronLink), alongside `details.nodeCode` / `details.providerCode` |
| `error.details`   | object                   | optional            | Structured extras when available                                                 |
| `meta.durationMs` | number                   | always              | Wall time                                                                        |
| `meta.warnings`   | `(string \| {code, message})[]` | always     | Non-fatal notices; **elements are not uniformly typed** — see below              |
| `meta.query`      | object                   | ordered listings only | `orderBy` / `sort`; present when the command accepts an ordering — see [`meta.query`](#metaquery) |
| `meta.pagination` | object                   | windowed commands only | `offset` / `limit` / `total`; present when the command returns a pagination window — see [pagination](#pagination) |
| `chain`           | object                   | when a network was selected | `family` / `network` / `chainId`. Present on every chain command and on the local commands whose policy resolves a network — currently `backup`, `current` and `list`, which use the selected or default network as a family/display selector without contacting a node. Commands with `network: "none"` (`config`, `networks`, `contact`, `encoding`, `address`, `create`, `import`, …) omit it — its presence does **not** mean a node was contacted |

Encoding rules: `bigint` values are serialized as decimal **strings** (e.g. `"balance": "1976489000"`), binary as hex. Amounts backed by `bigint` or protocol int64 values are strings, but bounded counters and fees such as `feeSun`, `multiSignFeeSun`, `energyUsed` and `netUsed` may come back as JSON numbers. Follow each command's field table instead of coercing every amount to one type.

### The reserved `view` key

`view` is reserved inside `data` and is **never published**. A command may use it to hand its
text renderer a value the terminal table needs and the JSON contract deliberately withholds; the
key is removed before the envelope is written, and nothing takes its place. Unlike
`meta.pagination`, which is relocated from `data`, a `view` field is dropped outright.

This is the one point where text output can show something JSON output does not carry, so the bar
for using it is narrow: a field belongs in `view` only when a specification states that JSON must
not carry it. Both cases today are in `sunswap`, and both are the same rule: a symbol is
self-reported and proves nothing, so the payload stays address-keyed and a caller identifies a
token by its address. `sunswap price` fills its text `Symbol` column from the SunSwap catalogue,
and `sunswap pool-list --token` names the quote token in its price column heading; neither symbol
appears in the JSON, where `pairPrices[].quote` carries the address instead.

Callers need do nothing: no success envelope contains `view`, and a test enforces that.

### `meta.query`

A listing that accepts an ordering echoes it back as `{orderBy, sort}`, lifted out of `data` the
same way `pagination` is, so a caller reads the window and the ordering from one place whatever
the command returns. `orderBy` is the CLI's own name for the field, not the service's.

`sort` is not always a choice. Where the upstream service sorts in one direction and offers no
direction parameter, the command declares no `--sort` flag and `sort` reports the constant
`"desc"` — what the rows ARE, not what could have been asked for. `sunswap token-list` is that
case today; `sunswap pool-list` keeps a real `--sort` because its endpoint takes a direction. A listing with no ordering flag at all, such as `sunswap token-search`, omits
`meta.query` entirely rather than echoing an order nobody chose.

`sunpump token-list` and `sunpump token-search` both echo a real `--order-by` and `--sort`. Note
that `sunpump token-list --owner` answers from an endpoint that applies its own fixed ordering, so
the two flags are refused alongside `--owner` rather than echoed as though they had been applied.

### Reading `meta.warnings`

An entry is either a plain string or a `{code, message}` object. The object form is used where the condition is worth branching on — currently the [`permission update`](commands/permission/update.md) safety warnings and the post-confirmation checks; everything else is a bare string. Normalise before display, and never assume a uniform element type:

```bash
# text for humans — works for both forms
jq -r '.meta.warnings[] | if type == "string" then . else .message end'

# branch on a specific condition — objects only
jq -e '.meta.warnings[] | select(type == "object" and .code == "owner_lockout")' >/dev/null && exit 1
```

Helpers that assume strings (`.meta.warnings | join("\n")`, `Array.prototype.join`) fail or print `[object Object]` on the object form. Warning `code` values are stable and additive within v1 — new codes may appear, existing ones keep their meaning. Warning `message` text is **not** stable; treat it like `error.message` and never parse it.

### Pagination

Commands that return an offset/limit window report it in `meta.pagination`, never inside `data`. The current set is `asset list`, `exchange list`, `proposal list`, `backup --records`, `x402 provider-list`, `bai recharge-orders`, `bai usage-records`, `sunswap pool-list`, `sunswap pool-search`, `sunswap position-list`, `sunswap token-list`, `sunswap token-search`, `sunpump token-list`, and `sunpump token-search`; a command may accept `--limit` merely as a result cap and then omit pagination metadata:

| Key | Type | Meaning |
|---|---|---|
| `offset` | number | Index the page started at — echoes `--offset` |
| `limit` | number \| **null** | Page size; `null` = unlimited (no `--limit` given) |
| `total` | number \| **null** | Matching records in total; `null` means **no count exists**, not "it was omitted" |

All three keys are always present, so `null` is the only "unknown" signal and absent never has to be told apart from null. A cursor-paged service may add two more: `hasMore` (boolean) and `nextCursor` (string, pass back with `--cursor`) — currently only [`bai usage-records`](commands/bai/usage-records.md), whose `total` is always `null`.

`total` is `null` permanently for the commands served by TRON's paginated node endpoints — [`asset list`](commands/asset/list.md) and [`exchange list`](commands/exchange/list.md). The endpoint returns no count, and computing one would mean transferring every record (5,187 assets, 2.7 MB on mainnet). Page until a short page comes back rather than comparing against a total:

```bash
offset=0
while :; do
  page=$(wallet-cli asset list --limit 50 --offset "$offset" -o json)
  n=$(jq '.data.assets | length' <<<"$page")
  jq -c '.data.assets[]' <<<"$page"
  [ "$n" -lt 50 ] && break
  offset=$((offset + 50))
done
```

The SunSwap market listings (`sunswap pool-list`, `pool-search`, `position-list`, `token-list`, `token-search`) can reach only the first 1000 rows of any ordering — the data service refuses a page past them. A window with `--offset` + `--limit` above 1000 is therefore refused locally as `invalid_value` (exit 2) before any request. `sunswap pool-list --min-tvl` filters before it pages; if more than 1000 pools qualify, a non-TVL ordering can come back short, with `hasMore: true` and a `sunswap_scan_truncated` warning.

Commands that page a local, bounded set ([`backup --records`](commands/backup.md)) or that fetch everything and window it client-side ([`proposal list`](commands/proposal/list.md)) do report a `total`.

Text mode titles the same window (`Assets (limit 50, offset 0)`, `Proposals (showing 2 of 4)`, `Backup records (showing 3 of 12)`), but text is not part of this contract — parse `-o json`.

## Error codes

The **exit code is the hard contract**: `2` means the call was malformed (it will still be wrong on retry), `1` means execution failed (network / device / chain / wallet). `error.code` is a machine-readable string that refines the exit code — branch on the exit code first, then optionally on `error.code`.

**The maintained code index is published** under `errorCodes` in the discovery catalog:

```bash
wallet-cli --json-schema | jq '.errorCodes'
```

Each entry is an object, not a bare string:

```json
{ "rpc_error": { "exit": 1, "retry": "same", "meaning": "the node answered with an error" } }
```

`exit` is the authority for a code's exit status; the tables below are hand-written and checked against it by a test. A handful of codes carry `"either"`: they genuinely arise on both sides, and the exit status is the one the process returned.

`retry` answers "now what": `same` — retry the identical command right away (a node or service hiccup); `later` — the identical command will work, but not yet; back off first (a lock-up period, a withdrawal interval, a rate limit); `changed` — retry only after changing the request (raise the fee, rebuild with a new nonce); `never` — retrying as-is cannot succeed, something outside the command has to change. Every exit-`2` code is `never` by construction.

`retry` describes the **error**, not the command. `timeout` and `rpc_error` are `same` because for most calls that is correct — the node never acted, so resending is free. But a command that may already have broadcast a transaction (`tx send`, and anything else on the submit path) can hit `timeout` or `rpc_error` **after the node accepted the transaction and before the response got back**. There the outcome is unknown, not failed, and resending does not retry the original request: it builds and signs a **new** transaction, which on TRON is a second, distinct transfer. `retry: "same"` is right for a `timeout`/`rpc_error` while resolving a network id or reading a balance; it is not a licence to resend a broadcast blind. Reconcile with [`tx status`](#script-safety-never-mistake-submitted-for-confirmed) before deciding.

That index is the machine-readable catalog this build exposes. Treat it as a discovery aid, not a closed enum: a few code paths choose among error-code strings dynamically, so a runtime envelope can still carry a code absent from `errorCodes`. The tables below are the frequently-hit subset, kept for reading. New codes may still be added within v1, and two strings (`invalid_value`, `aborted`) appear under either exit code depending on where they are raised — so always tolerate an unknown code by falling back to its exit-code class.

Common codes at exit **2** (usage — fix the call):

| Code | Meaning |
|---|---|
| `usage_error` | Raised by the argument parser itself — a yargs usage failure, or too many positional arguments. Specific problems get their own code: an unknown flag is `invalid_option`, a missing required flag `missing_option`, a failed value or cross-field rule `invalid_value` |
| `family_mismatch` | The command, the account, the recipient, or the raw transaction does not belong to the selected network's chain family |
| `missing_option` | A required flag was not provided |
| `invalid_option` | A flag was used in an invalid combination, or is scoped to the other chain family |
| `invalid_value` | A flag value failed validation (e.g. `config defaultOutput xml`) |
| `invalid_permission` | A permission document or selected permission group is invalid for the operation |
| `invalid_amount` | An amount is malformed or out of range |
| `weak_password` | Master password below policy (≥8 chars; upper + lower + digit + special) |
| `tty_required` | An interactive prompt is needed but no TTY is attached — run in a terminal, or use the matching stdin flag where the command exposes one |
| `missing_network` / `unsupported_network` | A caller explicitly asked the registry to resolve an empty network id, or the supplied canonical id / alias is unknown. Ordinary chain commands fall back to `config.defaultNetwork` (built-in `tron:728126428`) when `--network` is omitted |
| `unsupported_network_capability` | The selected network does not offer what this command needs |
| `limit_exceeded` | A bounded input (file size, list length, page size) was over its limit |
| `unknown_command` | No such command |
| `output_exists` | Target file already exists and is never overwritten (`backup --out`, `address generate --out`). Deterministic — retrying the same path always fails |
| `file_not_found` | An input file named by a flag does not exist (`contract deploy --artifact` / `--code-file`, `contract create2 --code-file`) |
| `keystore_not_found` | `import keystore`: no file at the given path |
| `invalid_keystore` | `import keystore`: not a valid Web3 V3 keystore — bad JSON, `version` ≠ 3, an unsupported cipher/KDF, or a payload that is not a 32-byte private key |
| `invalid_config` | `config.yaml` cannot be read or is not valid YAML — fix or remove the file. The parser detail is withheld: it quotes the offending line, which may carry a credential |
| `insecure_config` | `config.yaml` holds service credentials but is a symlink or is group/world-readable — run `chmod 600` on it (POSIX only; not enforced on Windows) |
| `account_not_found` | No local account by that id, label or address |
| `contact_not_found` / `already_exists` | No contact by that name, or a contact name/address is already stored |
| `token_not_in_book` / `token_is_official` / `token_already_listed` | Token address-book conditions |
| `unsupported_token` | The selected provider or command does not support that token |
| `insufficient_voting_power` | The requested votes exceed the account's voting power |
| `gasfree_credentials_missing` / `tronlink_credentials_missing` | Required service credentials are not configured (set them with `config`) |
| `unknown_parameter` | No chain parameter by that name or id (`proposal create --set`) |
| `invalid_asset_name` | A TRC10 name or abbreviation outside 1–32 visible ASCII characters |
| `migration_required` | Persisted wallet data needs an upgrade this invocation cannot perform, because the master password was unavailable — re-run in a terminal, or pipe it with `--password-stdin`. See [startup wallet-data upgrades](#startup-wallet-data-upgrades) |
| `seed_not_found` | `derive` was pointed at an account or id that is not an HD wallet — a private-key, Ledger or watch-only account |
| `bai_credentials_missing` | No B.AI API key is configured. Set it with `config baiApiKey --api-key-stdin` |
| `ambiguous_account` | `--account <address>` matches more than one account and they are not interchangeable signers for the family being acted on; `error.details` carries the candidates — see [`error.details.matches`](#errordetailsmatches) |

Common codes at exit **1** (execution — runtime failure):

| Code | Meaning |
|---|---|
| `rpc_error` | The node rejected or failed the request — a TRON API call, or a JSON-RPC method such as `eth_estimateGas` |
| `invalid_node_response` | The node answered, but its answer contradicts the request or the protocol: a TRC10 or exchange record carrying an id other than the one asked for, a `precision` outside 0–6 or a rate that is not a positive int32, a JSON-RPC reply with neither a `result` nor an `error` field, or no latest block. These values decide signed amounts, so the command stops instead of acting on them; list reads drop the offending record and keep the page |
| `timeout` | Aborted waiting for network or device (`--timeout` exceeded) |
| `auth_required` | A required credential was unavailable — a software master password, or Ledger app/device readiness |
| `auth_failed` | Wrong master password (decryption failed) |
| `signing_rejected` / `transaction_rejected` | Signing or broadcast rejected (device or chain) |
| `watch_only_no_signer` | The account is watch-only and cannot sign |
| `invalid_mnemonic` / `invalid_private_key` | Storage validation rejected a malformed mnemonic or private key; an interactive import normally catches it at the prompt and asks again |
| `token_metadata_unavailable` | Required token metadata could not be read from the selected network. This one crosses exit codes: most sites raise it at exit `1`, but `tx send` on TRON raises it at exit **2** when a contract answers no `decimals()` and the address book has no entry either — there the call itself has to change |
| `wrong_device_seed` | Connected Ledger does not match the registered account |
| `tx_integrity` / `invalid_transaction` | A presigned transaction failed integrity / validity checks |
| `insufficient_balance` / `insufficient_token_balance` | Not enough TRX / token to cover the amount plus fees |
| `provider_error` | A node or external service produced something the CLI will not act on — a malformed, self-contradictory or out-of-range response (TRON permission data, chain parameters, a protobuf codec the local TronWeb build does not expose, GasFree / TronLink payloads), a failed request, or an error status from GasFree / TronLink. TronLink reports **every** non-404 status this way, 429 included |
| `provider_rate_limited` | An external service returned HTTP 429. GasFree: `error.details.retryAfter` carries its `Retry-After` header when it sent one. x402 facilitator or endpoint: `error.details.retryAfterSeconds` when sent, plus the payment details below — a 429 during settlement is `paymentStatus: "unknown"`. B.AI: `error.details.httpStatus: 429`. SunSwap market API, SunSwap route service and SunPump API: `error.details.httpStatus: 429`, plus `error.details.retryAfterSeconds` when a `Retry-After` header was sent. TronLink's 429 is `provider_error` instead |
| `tx_expired` | The transaction expired before/during signing, or the TRON node rejected it as expired; rebuild and sign again |
| `chain_id_mismatch` | An EVM transaction was built for a different chain than the selected network |
| `nonce_too_low` | The EVM transaction's nonce is already used by a mined transaction |
| `history_not_supported` | The selected network exposes no transaction history endpoint (`account history`, TRON) |
| `not_found` | The addressed thing does not exist — for example an unactivated account, a transaction, a block, or a GasFree / TronLink resource. Lookups with a group of their own use the specific code below |
| `proposal_not_found` / `contract_not_found` / `asset_not_found` / `exchange_not_found` | Nothing on chain under that proposal id, contract address, TRC10 reference, or exchange pair id |
| `ambiguous_asset_name` | A TRC10 name matches more than one token; `error.details` carries the candidates — see [`error.details.matches`](#errordetailsmatches) |
| `ledger_unsupported` | The selected Ledger app cannot sign this transaction type — refused before the device is touched (TRON account activation, account id, `asset` writes, contract deploy and governance, `witness` writes, and `stake cancel-unfreeze`) |
| `not_a_witness` / `already_witness` / `not_proposal_owner` | Governance identity does not meet the operation's rule |
| `already_approved` / `not_approved` / `proposal_expired` / `already_canceled` | Proposal voting conditions |
| `account_not_active` / `account_already_active` / `name_already_set` / `id_already_set` / `chain_parameter_unavailable` | Account activation / name / id conditions, or `witness create` could not read `getAccountUpgradeCost` |
| `not_contract_deployer` | The account did not deploy that contract |
| `already_issued_asset` / `not_an_issuer` | The account has already issued a TRC10, or has never issued one |
| `not_in_ico_window` / `self_participation` | TRC10 ICO participation conditions |
| `no_frozen_supply` / `not_yet_unfreezable` | Nothing frozen, or nothing matured yet (`asset unfreeze`) |
| `not_exchange_creator` / `token_not_in_exchange` / `exchange_closed` / `same_token` | Exchange-pair access and state conditions |
| `pool_not_found` | No SunSwap liquidity pool exists for that pair, so there is no ratio to size a one-sided deposit against. Name both amounts, or create the pool first |
| `pool_already_exists` | `sunswap add-liquidity --create-pool`: a V4 pool with that key (pair, fee, tick spacing, hooks) is already live. Deposit into it without `--create-pool` and `--sqrt-price` |
| `position_not_found` | No SunSwap position with that id under that protocol (`sunswap position-info`, `add-liquidity` / `remove-liquidity` / `collect-fees` with `--position-id`) |
| `no_matching_route` | The SunSwap route service found no path for that pair (`sunswap swap`). Retryable with the same input: routes appear and disappear with liquidity |
| `launchpad_token_not_found` | That address is not a SunPump token on this network (`sunpump buy` / `sell` / `token-info`) |
| `launchpad_trading_closed` | The token's bonding curve is closed — it is awaiting launch, or it has launched and moved to SunSwap. The message distinguishes the two, because one is a wait and the other is a redirect to `sunswap swap` |
| `insufficient_reserve` | `exchange withdraw`: more than that side of the pair holds |
| `precision_loss` / `slippage_exceeded` / `exchange_trading_disabled` | Node rejections named from a narrow allowlist — an amount the reserve ratio cannot convert cleanly, a return below the floor, or a network that is not accepting Bancor trades at all |
| `not_exportable` | The account holds no exportable secret (watch-only or Ledger) — `backup` |
| `wrong_keystore_password` | `import keystore`: the file's own password is wrong (distinct from `auth_failed`, which is the master password). A file whose `mac` is missing or not hex is `invalid_keystore`, not a wrong password — hex case is not significant |
| `legacy_derivation` | A TRON account #1 or later from a wallet created before 4.13.1 uses a derivation path this version no longer signs with. Raised when signing as that TRON address, or when `derive` adds an account to its wallet. See [Recover addresses after `legacy_derivation`](troubleshooting/legacy-derivation-recovery.md) |
| `derivation_mismatch` | An account's stored address matches no derivation path of its seed — `wallets.json` and the encrypted vault disagree |
| `execution_reverted` | The contract reverted the call; `error.details.revertData` carries the raw revert data |
| `not_authorized` | The account is not permitted to perform this operation. `8004 update` / `transfer` / `approve`: the account is neither the Agent's owner nor an operator allowed to do this, decoded from the registry's revert before signing |
| `agent_not_found` | No Agent with that id in the selected network's registry — `8004 show`, and the `8004` writes (decoded from the registry's revert before signing) |
| `amount_exceeds_limit` / `no_matching_requirement` | `x402 pay`, with or without `--dry-run`: the price is above `--max-amount` / `--max-raw-amount`, or no payment route offered by the endpoint matches the selected network, `--token`, `--asset`, or `--scheme`. Raised before signing (`details.paymentStatus: "not_sent"`) |
| `gasfree_insufficient_balance` / `gasfree_not_activated` / `gasfree_asset_unsupported` | An `exact_gasfree` x402 payment: the GasFree account cannot cover payment plus maximum fee, is not activated, or does not hold the selected token contract (check the network, token and `--gasfree-relay`). Raised before anything is sent (`details.paymentStatus: "not_sent"`) |
| `permit2_allowance_required` / `approval_reset_required` | An x402 payment needs a token allowance first, or the token needs its allowance reset to zero before a new one |
| `fee_cap_exceeded` / `payer_mismatch` / `signed_payload_mismatch` | An x402 authorization is refused before or after signing: the GasFree fee is above the cap, the payload names another payer, or the signature covers a different struct than requested |
| `invalid_settlement` / `invalid_x402_response` | A paid response carried an invalid settlement receipt, or an x402 response could not be decoded |
| `provider_not_found` / `catalog_schema_unsupported` | `x402 provider-show` / `endpoint-list`: no provider by that name; or the downloaded catalog uses a version this build cannot read |
| `port_in_use` | `x402 serve` / `roundtrip`: the requested local port is taken. `x402 serve --daemon` reports a background server that failed to start, including on a taken port, as `provider_error` with `error.details.logFile` |
| `response_too_large` | A remote response exceeded the CLI's size limit |
| `bai_auth_failed` / `bai_rejected` | B.AI rejected the API key, or refused an operation for a recognized business reason (`error.details.reason`) |
| `internal_error` | Unexpected internal failure; message is intentionally generic |

Unexpected exceptions are **redacted** to `internal_error` with a generic message, so a library error that happens to echo secret material can never reach the envelope. The two tables above are a reading aid; `--json-schema`'s `errorCodes` is the maintained discovery index, not a parser exhaustiveness guarantee.

### Approval progress on failure

Multi-step SunSwap and SunPump operations retain submitted approval transaction IDs in
`error.details.approvalTxIds`, in execution order, if a later approval, allowance check,
Permit2 signature or main transaction fails. The original error code and existing details
are preserved; text errors also list the IDs. These approvals are separate transactions and
are not rolled back. A returned ID records submission, not a guarantee of successful execution;
check its receipt before retrying.

In broadcast mode, prerequisite approvals always wait for confirmation, even without `--wait`.
Each approval uses `--wait-timeout` (default 60000 ms), so multiple approvals can extend the
command's total runtime. A confirmation timeout returns `timeout` (exit 1), retains the
submitted approval IDs, and stops before the next approval or main transaction. The approval
may still confirm later; inspect its receipt before retrying. `--wait` continues to control
whether the **main transaction** waits for confirmation.

### x402 and B.AI payment details

A failed payment carries extra fields in `error.details` so a script can tell whether money may have moved:

| Field | Meaning |
|---|---|
| `phase` | Where it failed: `request`, `challenge`, `create_payment`, `sign`, `payment_request`, `verify`, or `settle` |
| `httpStatus` | HTTP status of the failed request, when there was one |
| `paymentStatus` | `not_sent` — nothing was sent; `unknown` — the outcome cannot be established, so reconcile before paying again; `settled` — a settlement receipt arrived but the paid resource could not be delivered |
| `settled` / `delivered` | Whether the payment settled and the resource arrived |
| `retryPayment` | `false` means do **not** pay again to recover. It overrides the code's generic `retry` value |
| `candidateTxHash` / `candidateNetwork` | A transaction that may be the payment. Evidence for reconciliation, not proof of payment |
| `approval` | TRON: the one-time Permit2 approve that was signed before the failure — `{txId, token, spender, allowance, feeLimitSun, status}` with `status` `submitted`, `confirmed` or `exported`. It is not the payment; do not report it as one. A `paymentStatus: "not_sent"` beside it means the allowance exists on chain but no payment authorization was produced |

**Treat `paymentStatus: "unknown"` as possibly paid.** For example, an `exact` payment from an account with no token balance currently fails as `provider_error` with `phase: "create_payment"` and `paymentStatus: "unknown"`, even though nothing was sent.

### `error.details.matches`

Some failures are a **choice**, not a dead end: the call was well formed but names something that resolves to several candidates, and the caller has to pick one. Those errors put the candidates in `error.details.matches` — an array of flat objects sharing one key set:

```json
{"code":"ambiguous_asset_name","message":"2 TRC10 tokens are named MyToken; re-run with the id","details":{"name":"MyToken","assetIds":["1000123","1000488"],"matches":[{"assetId":"1000123","issuerAddress":"TQkXm4vN...","totalSupply":"1000000000000000","precision":6},{"assetId":"1000488","issuerAddress":"TZx9kP2m...","totalSupply":"5000000000","precision":2}]}}
```

`ambiguous_account` is the second citizen of this convention, and the more commonly hit one — any `--account <address>` that does not resolve to a single interchangeable signer for the family being acted on returns it:

```json
{"code":"ambiguous_account","message":"address T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb matches 2 accounts; address it by accountId","details":{"address":"T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb","accountIds":["wlt_a1b2c.0","wlt_d3e4f.0"],"matches":[{"accountId":"wlt_a1b2c.0","label":"main","type":"seed","index":0},{"accountId":"wlt_d3e4f.0","label":"cold","type":"watch","index":null}]}}
```

`matches` is the convention, not a per-code special case: **any** error may carry it, and any that does gets the same treatment. In text mode the candidates are printed as a table under the `error [...]` line, on stderr. Quantities inside `matches` stay raw (minimal units), matching how the corresponding success payload reports them; the text table scales them for display when the row carries a `precision`.

Alongside it, an error may carry a scalar list of just the identifiers to retry with — `assetIds` above. Prefer that for scripting; `matches` exists so a human can tell the candidates apart.

## Secret handling

wallet-cli never reads passwords, mnemonics or private keys from argv or from dedicated secret environment variables: arguments and exported values leak into shell history, process listings and CI logs. Two channels only:

1. **stdin flags** — `--password-stdin` for the master password, `--tx-stdin` / `--message-stdin` for large payloads. **Only one `*-stdin` flag can consume stdin per run.** (Mnemonics and private keys have no stdin path — `import mnemonic` / `import private-key` / `change-password` are interactive-only, hidden TTY input.)
2. **Interactive TTY prompt** — only on the commands that declare themselves interactive: `create`, the `import` variants, `backup`, `change-password`, and `delete`'s confirmation. Everywhere else a terminal changes nothing: `tx send`, `contract *`, `stake *`, `message sign` and friends never prompt, and a missing master password is `auth_required` (exit `1`) whether or not a TTY is attached.

A shell variable in an example is only a shell-side source for a pipe; wallet-cli does not read it. Keep such variables process-local and short-lived, and do not export them long term.

```bash
# non-interactive unlock
printf '%s' "$MASTER_PASSWORD_FROM_YOUR_VAULT" | wallet-cli tx send \
  --to TSx72ViULFepRGCS4PM5dP4FqD1d8qggCc --amount 1 \
  --network tron:3448148188 --password-stdin -o json
```

## Script safety: never mistake "submitted" for "confirmed"

This is a wallet; a wrong success check loses money. The rules:

1. Broadcast (✍️) commands **by default return after submission**, not confirmation. The payload is a flat object with a `kind` naming the operation (`send`, `stake-freeze`, `permission-update`, `account-activate`, `proposal-create`, `asset-issue`, `exchange-trade`, …), a `stage`, and the `txId`; the `submitted` stage carries no block / fee / result (those appear only after `--wait` confirms):

   ```json
   { "kind": "send", "stage": "submitted", "txId": "7d9b6a08…", "rawAmount": "1000000", "to": "TSx72…" }
   ```

   **Ids the chain assigns arrive only with confirmation.** A new proposal's `proposalId`, a TRC10's `assetId`, an exchange pair's `exchangeId` do not exist at submission — they are absent from the submitted receipt and appear once `--wait` (or a later query) sees the transaction on chain. Scripts that create one of these must wait for it.

   The same applies to an Agent id: `8004 register` puts the requested `uri` in `data.identity` at once, and adds `identity.agentId` (a decimal string) only when a confirmed registration event can be read. `8004 update` reports `identity.agentId`, `oldURI` and `requestedURI`, plus `newURI` after confirmation; `8004 transfer` reports `agentId`, `oldOwner` and `requestedOwner`, plus `newOwner` after confirmation. `8004 approve` reports `agentId` and `operator` (the zero address for `--revoke`). `8004 add-operator` and `remove-operator` report `operator` and `requestedApproval`, plus `approved` — read back from the registry — after confirmation.

2. To block until the outcome is known, pass `--wait` (polls until confirmed/failed, capped by `--wait-timeout`, default 60000 ms; on cap it returns the submitted receipt).

   **A `--wait` receipt reports the transaction outcome in `data.stage`, never in `success`.** A transaction that was accepted, mined, and then reverted is a *successful command* carrying a *failed transaction*: the envelope stays `success: true` and the exit code stays `0`, while `data.stage` is `"failed"`. Exit codes say whether the CLI could carry out the request, not whether the chain accepted the result — so after any `--wait`, branch on `data.stage` (`confirmed` / `failed` / `submitted`) before recording the operation as done.

3. Or poll yourself with `tx status`, which has a **four-state model**:

   | `data.state` | Meaning | Terminal? |
   |---|---|---|
   | `confirmed` | Included in a block, with an execution result / receipt available (`blockNumber` present) | yes |
   | `failed` | Included and reverted / rejected | yes |
   | `pending` | Seen by the node, with no execution result / receipt yet | no — keep polling |
   | `not_found` | Unknown to the queried endpoint | no — keep polling and reconcile; do not assume failure |

   `data.confirmed` and `data.failed` are provided as booleans for direct branching.

   > `confirmed` means included and receipted, not finalized. Use a TRON SolidityNode view or an EVM finalized-block check where that distinction matters.

   > A deadline that ends in `pending` or `not_found` is an unknown outcome. Do not record it as failed, and do not resend automatically without external reconciliation.

   **GasFree transfers are the exception.** `gasfree transfer` submits to a provider, not directly to a node: the submitted receipt carries a `traceId` (not a `txId`), and progress follows the provider's states — `WAITING` → `INPROGRESS` → `CONFIRMING` → `SUCCEED` / `FAILED`. Follow it with `--wait` or [`gasfree trace <traceId>`](commands/gasfree/trace.md) rather than `tx status`; a `txId` appears only once the provider puts it on-chain.

```bash
#!/usr/bin/env bash
set -euo pipefail

deadline=$((SECONDS + 90))
txid=$(
  printf '%s' "$PW" |
    wallet-cli tx send --to T... --amount 1 --network tron:3448148188 --password-stdin -o json |
    jq -er '.data.txId'
)

while (( SECONDS < deadline )); do
  state=$(
    wallet-cli tx status --txid "$txid" --network tron:3448148188 -o json |
      jq -er '.data.state'
  )

  case "$state" in
    confirmed) exit 0 ;;
    failed)
      echo "transaction failed: $txid" >&2
      exit 1
      ;;
    pending|not_found) sleep 3 ;;
    *)
      echo "unexpected transaction state: $state" >&2
      exit 1
      ;;
  esac
done

echo "transaction outcome unknown after deadline: $txid" >&2
exit 1
```

4. **Batch operations**: each command is one transaction with one exit code. Stop-on-first-failure is the default safe posture; if you continue, track per-item txids and reconcile with `tx status` before reporting success.

5. **A command may send several transactions.** The `sunswap` liquidity commands, `sunswap swap` when it spends a token, and `sunpump sell` approve before they act, and the approval must be on chain before the call that spends it. Each approval's txid is in `approvalTxIds`, in the order it was sent, beside the main `txId`. A failure between them leaves the approvals on chain and the main call unsent — which is recoverable by re-running, since an approval that already suffices is not repeated.

6. **One command writes without a transaction of ours.** `sunpump launch` asks SunPump to create a
token; the service signs it, pays for it and chooses its owner. So there is no `stage`, no
`confirmed`, no `blockNumber`, no fee and no `--wait` — and `data.token.owner` is the creator the
service picked, **not** the local account. The `createTxHash` it reports is the service's own: use
`tx info` to find out whether it is on chain yet. A refusal from that service is `provider_error`
(exit `1`), which includes a name or symbol it will not accept.

### `fee` is an estimate, and `feeCovers` says what it covers

A dry run's `fee` object is what the chain's own simulation predicts. Two things a script must know about it:

**It is a lower bound.** TRON simulates against current state and the real execution writes storage the simulation does not. Measured on Nile: 107,565 energy estimated, 120,426 burned. This holds for every estimating command here, so a fee limit computed from an estimate can fail. `--fee-limit` defaults to a constant and is never derived from one.

**It may cover only part of the operation.** A call whose allowance is not yet on chain cannot be simulated at all — the simulation reverts — so rather than fail, commands that approve first report the approvals' estimate and say so. `feeCovers` sits beside `fee`:

| `feeCovers` | `fee` is | When |
|---|---|---|
| `"all"` | the whole operation | the allowances already suffice, or the command needs none |
| `"approvals"` | the approvals only | an approval is still pending, so the main call is not estimable yet |
| `"none"` | no figure — a `{feeModel, note}` object stating why, with `feeUnavailableReason` beside it | a Permit2 dry run with no approval left to price: the main call cannot be estimated until the Permit2 authorization is signed |

`fee` is **never omitted** — a missing key reads as "free", and these transactions are not. When the main call cannot be priced, its own estimate is a `{feeModel, note}` object rather than a number, because a number obtained by pretending a precondition holds would be worse than none.

Note the interaction with exact-amount approvals: the contract consumes the allowance it was granted, so a repeat of the same operation needs a fresh approval and reports `feeCovers: "approvals"` again. `"all"` is the exception, not the common case.

### Amounts carry their scale

Every token amount in a JSON payload is **base units as a decimal string**, and the object that carries it also carries the `decimals` needed to read it — `{address, symbol, decimals, amount}`. Where an amount sits at the top of a payload rather than inside a side, its scale is beside it under a matching name (`lpAmount` / `lpDecimals`).

Token amount conversion supports integer `decimals` from **0 to 77**. SunSwap and SunPump validate this range in contract and market metadata; their market scientific notation expansion also limits exponents to **−1000 through 1000**. Values outside these supported bounds fail with `invalid_node_response` before scaling or expansion.

The exception is a figure that is not a token amount at all: a SunSwap V3 / V4 position's `liquidity`, `liquidityAfter` and (in an add-liquidity dry run or build) `liquidityExpected` are numbers the contract keeps, denominated in neither token, and carry no decimals.

### Verified trade output and Ledger failures

Confirmed SunPump buy/sell receipts expose `tokensOut` / `trxOut`; confirmed SunSwap swaps expose
`amountOut`, only when the transaction receipt verifies the received amount. `amountsEstimated`
is false for verified output and true for the quote fallback. A failed receipt read becomes a
warning, never a failure of an already confirmed trade. Router `priceImpactPercent` and trade fees
remain quoted; router impact carries `priceImpactEstimated: true`.

V4 unlimited approval plans use the string `"unlimited"`; transaction payloads continue to encode
the uint256 value.

Ledger errors distinguish `device_disconnected` (lost connection), `device_unavailable` (cannot
open a detected or inaccessible device) and `device_not_found` (no device detected). All use exit 1.
Native OS paths are not included in device-open errors.

## Stability promise (v1)

Guaranteed stable while `schema` is `wallet-cli.result.v1`:

- envelope field names and semantics as tabled above;
- exit-code mapping 0/1/2;
- one-terminal-frame stdout discipline in JSON mode;
- existing `error.code` values keep their meaning (new codes may be added);
- canonical command ids and network ids (`tron:728126428`, `tron:3448148188`, `tron:2494104990`, `eip155:1`, `eip155:56`, `eip155:11155111`, `eip155:97`).

Network **aliases** are config, not contract: they can be re-pointed locally, so scripts should pass canonical ids.

Not covered: text-mode output, `error.message` wording, field ordering, `meta.durationMs` values, and any field marked best-effort on a command's reference page (e.g. `priceUsd` in `account portfolio`).

## See also

- [Scripting guide](guide/scripting.md) — a gentler introduction
- [Command reference](commands/index.md) — per-command `data` payloads
- [Troubleshooting](troubleshooting.md) — human-facing remedies, keyed by the error codes above
