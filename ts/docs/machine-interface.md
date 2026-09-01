# Machine Interface

The formal contract for calling wallet-cli from scripts, CI pipelines, and AI agents. This page is the **single authority** for the JSON envelope, exit codes, error codes, and secret handling. Everything here is covered by the `wallet-cli.result.v1` stability promise unless explicitly marked otherwise.

## Calling convention

```bash
wallet-cli <command> -o json [--network <id|alias>] [--timeout <ms>] [--account <id|label>]
```

- Always pass `-o json`. Text output is for humans and carries no stability promise.
- In JSON mode, stdout carries **exactly one terminal frame** — the result envelope. Nothing else is ever written to stdout. Diagnostics go to stderr.
- Every RPC / device call is bounded by `--timeout` (milliseconds, default `config.timeoutMs`, built-in 60000).
- `--network` takes a canonical **CAIP-2** id (`tron:3448148188`, `eip155:11155111`) or a short alias (`nile`, `sepolia`, `bsc`). The namespace is not the chain family: `eip155` addresses the `evm` family. Aliases resolve once at selection; nothing downstream ever sees one, and the envelope's `chain.network` always reports the canonical id. Prefer canonical ids in scripts — an alias is a local config entry and can be re-pointed.
- The **TRON** ids this CLI used before CAIP-2 (`tron:mainnet`, `tron:nile`, `tron:shasta`) remain permanent aliases, so existing invocations keep working. **Output is a different matter**: `chain.network`, the `networks` listing's `id` and the `config` keys now report the CAIP-2 id, so a consumer that string-matches or keys a map by `tron:nile` must be updated. An alias exists only at selection and can never appear in a result.

### Discovery

```bash
wallet-cli --json-schema                # every command, its flags, and the error-code index
wallet-cli --json-schema tron           # scoped to one chain family
wallet-cli <command> --json-schema      # one command
```

One call returns the whole surface: `tool`, `version`, `globalFlags`, `errorCodes`, and `commands[]`. Command entries carry `id`, `path`, `usage`, `requires` (network / auth / wallet), `capability`, `examples`, and a JSON Schema for their input; chain commands also declare `families`. This is the intended way for an agent to learn the CLI; do not scrape `--help`.

### Chain families

A network belongs to one **chain family**, `tron` or `evm`, and that is what decides which commands and which flags apply:

- A command declares the families it serves (`families` in the catalog). Calling one on a network of another family fails with **`family_mismatch`** at exit `2`, before any node call.
- A flag may belong to one family too (`--asset-id` and `--permission-id` are TRON's, `--gas-limit` and `--nonce` are EVM's). Using one on the other family is **`invalid_option`** at exit `2`. `--help` tags them `(TRON only)` / `(EVM only)`.
- An **account** is not family-bound when it holds a key — a seed or private-key account has both a TRON and an EVM address. Watch-only and Ledger accounts hold one address and therefore one family; selecting one on a mismatched network is also `family_mismatch`.

Command-family and flag-family checks are static and can be decided from the catalog. Account-family compatibility also depends on the selected wallet account: key-backed accounts serve both families, while watch-only and Ledger accounts are family-bound.

### Startup wallet-data upgrades

Every invocation—including no arguments, `--help`, `--version`, and `--json-schema`—checks the
persisted wallet schema before handling any other surface. If it is stale, the startup gate
upgrades it first. Progress goes to stderr. A successful upgrade returns exit `0` with a single
success envelope whose `command` is `migration` and whose data includes
`originalCommandExecuted: false`; the command that triggered the upgrade is deliberately not run.
Run the original command again after inspecting the completion result. This keeps scripted and
transaction-submitting commands from continuing across an unexpected durable-state change.

In an interactive terminal, every stale wallet asks for consent before changing files. After the
user chooses `Upgrade now`, seed/private-key migrations ask for the master password while
Ledger/watch-only migrations proceed without one. Non-interactive Ledger/watch-only migrations
remain automatic; a password-bearing migration requires `--password-stdin` or returns
`migration_required` at exit `2` — the invocation itself has to change, so it is a usage error.

Interactive users may choose `Exit without upgrading`. That is a successful cancellation, not a
failure: it returns exit `0` with `command: "migration"`, `upgraded: false`, `cancelled: true`, and
`originalCommandExecuted: false`. No wallet file or backup is written. `migration_required` is
reserved for cases where migration cannot proceed, such as a non-interactive invocation without a
password source.

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
| `error.message`   | string                   | error only          | Human-readable; **not** stable — never parse it                                  |
| `error.details`   | object                   | optional            | Structured extras when available                                                 |
| `meta.durationMs` | number                   | always              | Wall time                                                                        |
| `meta.warnings`   | `(string \| {code, message})[]` | always     | Non-fatal notices; **elements are not uniformly typed** — see below              |
| `meta.pagination` | object                   | windowed commands only | `offset` / `limit` / `total`; present when the command returns a pagination window — see [pagination](#pagination) |
| `chain`           | object                   | when a network was selected | `family` / `network` / `chainId`. Present on every chain command and on local commands whose policy resolves a network. Commands with `network: "none"` omit it; its presence does **not** mean a node was contacted |

The current local network-aware commands are `backup`, `current`, and `list`. They use the selected or default network as a family/display selector without contacting a node.

Encoding rules: `bigint` values are serialized as decimal **strings** (e.g. `"balance": "1976489000"`), and binary values are hex. Amounts represented by `bigint` or protocol int64 values are strings; bounded counters and fees such as `feeSun`, `multiSignFeeSun`, `energyUsed`, and `netUsed` may be JSON numbers. Follow each command's field table instead of coercing every amount to one type.

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

Commands that return an offset/limit window report it in `meta.pagination`, never inside `data`. The current set is `asset list`, `exchange list`, `proposal list`, and `backup --records`; a command may accept `--limit` merely as a result cap and then omit pagination metadata.

| Key | Type | Meaning |
|---|---|---|
| `offset` | number | Index the page started at — echoes `--offset` |
| `limit` | number \| **null** | Page size; `null` = unlimited (no `--limit` given) |
| `total` | number \| **null** | Matching records in total; `null` means **no count exists**, not "it was omitted" |

All three keys are always present, so `null` is the only "unknown" signal and absent never has to be told apart from null.

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

Commands that page a local, bounded set ([`backup --records`](commands/backup.md)) or that fetch everything and window it client-side ([`proposal list`](commands/proposal/list.md)) do report a `total`.

Text mode titles the same window (`Assets (limit 50, offset 0)`, `Proposals (showing 2 of 4)`, `Backup records (showing 3 of 12)`), but text is not part of this contract — parse `-o json`.

## Error codes

The **exit code is the hard contract**: `2` means the call was malformed (it will still be wrong on retry), `1` means execution failed (network / device / chain / wallet). `error.code` is a machine-readable string that refines the exit code — branch on the exit code first, then optionally on `error.code`.

**The maintained code index is published**, one line per code, under `errorCodes` in the discovery catalog:

```bash
wallet-cli --json-schema | jq '.errorCodes'
```

Each entry is an object, not a bare string:

```json
{ "rpc_error": { "exit": 1, "retry": "same", "meaning": "the node answered with an error" } }
```

`exit` is the authority for that code's exit status — the tables below are hand-written and checked
against it by a test (every code the tables list must match the index's `exit` for that code; the
test does not check the tables' `Meaning` text or that every code in the index appears in a table).
A handful of codes carry `"either"`: they genuinely arise on both sides, and the exit status is the
one the process returned.

`retry` is the answer to "now what": `same` — retry the identical command right away (a node or
service hiccup); `later` — the identical command will work, but not yet — back off and retry
after a delay (a lock-up period, a withdrawal interval, a rate limit), unlike `same`, which is
safe to retry immediately; `changed` — retry only after changing the request (raise the fee,
rebuild with a new nonce); `never` — retrying as-is cannot succeed, something outside the command
has to change. Every exit-`2` code is `never` by construction.

`retry` describes the **error**, not the **command**. `timeout` and `rpc_error` are `same` because
for most calls that is correct — the node never acted, so resending is free. But a command that
may have already broadcast a transaction (`tx send` and anything else on the submit path) can hit
`timeout` or `rpc_error` **after the node accepted the transaction and before the response made it
back**. In that case the outcome is unknown, not failed, and resending does not retry the original
request — it builds and signs a **new** transaction, which on TRON is a second, distinct transfer.
`retry: "same"` is correct for a `timeout`/`rpc_error` that happens while resolving a network id or
reading a balance; it is not a license to resend a broadcast blind. Reconcile with
[`tx status`](#script-safety-never-mistake-submitted-for-confirmed) before deciding whether to
retry, exactly as the four-state model below requires.

That index is the machine-readable catalog exposed by this build. Treat it as a discovery aid, not a closed enum: a few code paths choose among error-code strings dynamically, so a runtime envelope can still carry a code not present in `errorCodes`. The tables below are the frequently-hit subset, kept for reading. New codes may still be added within v1, and two strings (`invalid_value`, `aborted`) can appear under either exit code depending on where they are raised — so always tolerate an unknown code by falling back to its exit-code class.

Common codes at exit **2** (usage — fix the call):

| Code | Meaning |
|---|---|
| `usage_error` | Raised by the argument parser itself — a yargs usage failure, or too many positional arguments. Specific problems get their own code instead: an unknown flag is `invalid_option`, a missing required flag is `missing_option`, and a failed value or cross-field rule is `invalid_value` |
| `family_mismatch` | The command, the account, the recipient, or the raw transaction does not belong to the selected network's chain family |
| `missing_option` | A required flag was not provided |
| `invalid_option` | A flag was used in an invalid combination, or is scoped to the other chain family |
| `invalid_permission` | A permission document or selected permission group is invalid for the operation |
| `invalid_value` | A flag value failed validation (e.g. `config defaultOutput xml`) |
| `invalid_amount` | An amount is malformed or out of range |
| `weak_password` | Master password below policy (≥8 chars; upper + lower + digit + special) |
| `tty_required` | An interactive prompt is needed but no TTY is attached — run in a TTY, or use the matching stdin flag when that command exposes one |
| `missing_network` / `unsupported_network` | A caller explicitly asked the registry to resolve an empty network id, or the supplied canonical id / alias is unknown. Normal chain commands use `config.defaultNetwork`, whose built-in value is `tron:728126428`, when `--network` is omitted |
| `unsupported_network_capability` | The selected network does not offer what this command needs |
| `limit_exceeded` | A bounded input (file size, list length, page size) was over its limit |
| `unknown_command` | No such command |
| `output_exists` | Target file already exists and is never overwritten (`backup --out`, `address generate --out`). Deterministic — retrying the same path always fails |
| `file_not_found` | An input file named by a flag does not exist (`contract deploy --artifact` / `--code-file`, `contract create2 --code-file`) |
| `keystore_not_found` | `import keystore`: no file at the given path |
| `migration_required` | Persisted wallet data needs an upgrade this invocation cannot perform, because the master password was not available — re-run in a terminal, or pipe it with `--password-stdin`. See [startup wallet-data upgrades](#startup-wallet-data-upgrades) |
| `invalid_keystore` | `import keystore`: not a valid Web3 V3 keystore — bad JSON, `version` ≠ 3, an unsupported cipher/KDF, or a payload that is not a 32-byte private key |
| `invalid_config` | `config.yaml` cannot be read or is not valid YAML — fix or remove the file. The parser detail is withheld: it quotes the offending line, which may carry a credential |
| `insecure_config` | `config.yaml` holds service credentials but is a symlink or is group/world-readable — run `chmod 600` on it (POSIX only; not enforced on Windows) |
| `contact_not_found` / `already_exists` | No contact by that name, or a contact name/address is already stored |
| `token_not_in_book` / `token_is_official` / `token_already_listed` | Token address-book conditions |
| `unsupported_token` | The selected provider or command does not support that token |
| `insufficient_voting_power` | The requested votes exceed the account's available voting power |
| `gasfree_credentials_missing` / `tronlink_credentials_missing` | Required service credentials are not configured (set them with `config`) |
| `unknown_parameter` | No chain parameter by that name or id (`proposal create --set`) |
| `invalid_asset_name` | A TRC10 name or abbreviation outside 1–32 visible ASCII characters |
| `migration_required` | Persisted wallet data needs an upgrade that this invocation cannot perform — see [startup wallet-data upgrades](#startup-wallet-data-upgrades) |

Common codes at exit **1** (execution — runtime failure):

| Code | Meaning |
|---|---|
| `rpc_error` | The node rejected or failed the request — a TRON API call, or a JSON-RPC method such as `eth_estimateGas` |
| `invalid_node_response` | The node's answer contradicts the request or the protocol: a TRC10/exchange record whose id is not the one asked for, a `precision` outside 0..6, or a rate pair that is not a positive int32. These decide signed amounts, so the command stops rather than acting on them. List reads drop the offending record and keep the page |
| `timeout` | Aborted waiting for network or device (`--timeout` exceeded) |
| `auth_required` | Required credential was unavailable — a software master password, or Ledger app/device readiness |
| `auth_failed` | Wrong master password (decryption failed) |
| `signing_rejected` / `transaction_rejected` | Signing or broadcast rejected (device or chain) |
| `watch_only_no_signer` | The account is watch-only and cannot sign |
| `invalid_mnemonic` / `invalid_private_key` | Storage validation rejected a malformed mnemonic or private key; interactive import normally catches it at the prompt and asks again |
| `token_metadata_unavailable` | Required token metadata could not be read from the selected network. This one crosses exit codes: most sites raise it at exit `1`, but `tx send` on TRON raises it at exit **2** when a contract answers no `decimals()` and the address book has no entry either — there, the call itself has to change |
| `wrong_device_seed` | Connected Ledger does not match the registered account |
| `tx_integrity` / `invalid_transaction` | A presigned transaction failed integrity / validity checks |
| `insufficient_balance` / `insufficient_token_balance` | Not enough TRX / token to cover the amount plus fees |
| `provider_error` | A node or external service produced something the CLI will not act on — a malformed, self-contradictory, or out-of-range response (TRON permission data, chain parameters, a protobuf codec the local TronWeb build does not expose, GasFree / TronLink payloads), a failed request, or an error status from GasFree / TronLink. TronLink reports **every** non-404 status this way, 429 included |
| `provider_rate_limited` | **GasFree only** — the service returned HTTP 429; `error.details.retryAfter` carries its `Retry-After` header when it sent one. TronLink's 429 is `provider_error` instead |
| `tx_expired` | The transaction's expiration passed before signatures were collected (TRON) |
| `chain_id_mismatch` | An EVM transaction was built for a different chain than the selected network |
| `nonce_too_low` | The EVM transaction's nonce is already used by a mined transaction |
| `history_not_supported` | The endpoint lacks TronGrid history support (`account history`, TRON) |
| `not_found` | The addressed thing does not exist — for example an unactivated account, transaction, block, or GasFree / TronLink resource |
| `proposal_not_found` / `contract_not_found` / `asset_not_found` / `exchange_not_found` | Nothing on chain under that proposal id, contract address, TRC10 reference, or exchange pair id |
| `ambiguous_asset_name` | A TRC10 name matches more than one token; `error.details` carries the candidates — see [`error.details.matches`](#errordetailsmatches) |
| `ledger_unsupported` | The selected Ledger app cannot sign this transaction type — refused before the device is touched (TRON account activation, account id, asset writes, contract deploy/governance, witness writes, and cancel-unfreeze) |
| `not_a_witness` / `already_witness` / `not_proposal_owner` | Governance identity does not meet the operation's rule |
| `already_approved` / `not_approved` / `proposal_expired` / `already_canceled` | Proposal voting conditions |
| `account_not_active` / `account_already_active` / `name_already_set` / `id_already_set` / `chain_parameter_unavailable` | Account activation/name/id conditions, or `witness create` could not read `getAccountUpgradeCost` |
| `not_contract_deployer` | The account did not deploy that contract |
| `already_issued_asset` / `not_an_issuer` | The account has already issued a TRC10, or has never issued one |
| `not_in_ico_window` / `self_participation` | TRC10 ICO participation conditions |
| `no_frozen_supply` / `not_yet_unfreezable` | Nothing frozen, or nothing matured yet (`asset unfreeze`) |
| `not_exchange_creator` / `token_not_in_exchange` / `exchange_closed` / `same_token` | Exchange-pair access and state conditions |
| `insufficient_reserve` | `exchange withdraw`: more than that side of the pair holds |
| `precision_loss` / `slippage_exceeded` / `exchange_trading_disabled` | Node rejections named from a narrow allowlist — an amount the reserve ratio cannot convert cleanly, a return below the floor, or a network that is not accepting Bancor trades at all |
| `not_exportable` | The account holds no exportable secret (watch-only or Ledger) — `backup` |
| `account_exists` / `wrong_keystore_password` | `import keystore`: the address is already in the wallet, or the file's own password is wrong (distinct from `auth_failed`, which is the master password). A file whose `mac` is missing or not hex is `invalid_keystore`, not a wrong password — hex case is not significant |
| `internal_error` | Unexpected internal failure; message is intentionally generic |

Unexpected exceptions are **redacted** to `internal_error` with a generic message, so a library error that happens to echo secret material can never reach the envelope. The two tables above are a reading aid; `--json-schema`'s `errorCodes` is the maintained discovery index, not a parser exhaustiveness guarantee.

### `error.details.matches`

Some failures are a **choice**, not a dead end: the call was well formed but names something that resolves to several candidates, and the caller has to pick one. Those errors put the candidates in `error.details.matches` — an array of flat objects sharing one key set:

```json
{"code":"ambiguous_asset_name","message":"2 TRC10 tokens are named MyToken; re-run with the id","details":{"name":"MyToken","assetIds":["1000123","1000488"],"matches":[{"assetId":"1000123","issuerAddress":"TQkXm4vN...","totalSupply":"1000000000000000","precision":6},{"assetId":"1000488","issuerAddress":"TZx9kP2m...","totalSupply":"5000000000","precision":2}]}}
```

`matches` is the convention, not a per-code special case: **any** error may carry it, and any that does gets the same treatment. In text mode the candidates are printed as a table under the `error [...]` line, on stderr. Quantities inside `matches` stay raw (minimal units), matching how the corresponding success payload reports them; the text table scales them for display when the row carries a `precision`.

Alongside it, an error may carry a scalar list of just the identifiers to retry with — `assetIds` above. Prefer that for scripting; `matches` exists so a human can tell the candidates apart.

## Secret handling

wallet-cli never reads passwords, mnemonics, or private keys from argv or from dedicated secret environment variables. Arguments and exported environment values leak into shell history, process listings, and CI logs. For secrets, use these CLI channels:

1. **stdin flags** — `--password-stdin` for the master password; `--tx-stdin` / `--message-stdin` for large payloads. **Only one `*-stdin` flag can consume stdin per run.** (Mnemonics and private keys have no stdin path — `import mnemonic` / `import private-key` / `change-password` are interactive-only, hidden TTY input.)
2. **Interactive TTY prompt** — only on the commands that declare themselves interactive: `create`, the `import` variants, `backup`, `change-password`, and `delete`'s confirmation. Everywhere else a terminal changes nothing: `tx send`, `contract *`, `stake *`, `message sign` and friends never prompt, and a missing master password is `auth_required` (exit `1`) whether or not a TTY is attached.

Shell variables in examples are only a shell-side source for a pipe; wallet-cli does not read them. Keep them process-local and short-lived, and do not export them long term.

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

2. To block until the outcome is known, pass `--wait` (polls until confirmed/failed, capped by `--wait-timeout`, default 60000 ms; on cap it returns the submitted receipt).

   **A `--wait` receipt reports the transaction outcome in `data.stage`, never in `success`.** A transaction that was accepted, mined, and then reverted is a *successful command* carrying a *failed transaction*: the envelope stays `success: true` and the exit code stays `0`, while `data.stage` is `"failed"`. Exit codes say whether the CLI could carry out the request, not whether the chain accepted the result — so after any `--wait`, branch on `data.stage` (`confirmed` / `failed` / `submitted`) before recording the operation as done.

3. Or poll yourself with `tx status`, which has a **four-state model**:

   | `data.state` | Meaning | Terminal? |
   |---|---|---|
   | `confirmed` | Included in a block and an execution result/receipt is available (`blockNumber` present) | yes |
   | `failed` | Included and reverted / rejected | yes |
   | `pending` | Seen by the node, with no execution result/receipt yet | no — keep polling |
   | `not_found` | Unknown to the queried endpoint | no — keep polling/reconcile; do not assume failure |

   `data.confirmed` and `data.failed` are provided as booleans for direct branching.

   > `confirmed` means included and receipted, not finalized. Use a TRON SolidityNode view or an EVM finalized block check when that distinction matters.

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
    confirmed)
      exit 0
      ;;
    failed)
      echo "transaction failed: $txid" >&2
      exit 1
      ;;
    pending|not_found)
      sleep 3
      ;;
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
