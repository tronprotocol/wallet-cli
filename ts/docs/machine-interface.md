# Machine Interface

The formal contract for calling wallet-cli from scripts, CI pipelines, and AI agents. This page is the **single authority** for the JSON envelope, exit codes, error codes, and secret handling. Everything here is covered by the `wallet-cli.result.v1` stability promise unless explicitly marked otherwise.

## Calling convention

```bash
wallet-cli <command> -o json [--network <id>] [--timeout <ms>] [--account <id|label>]
```

- Always pass `-o json`. Text output is for humans and carries no stability promise.
- In JSON mode, stdout carries **exactly one terminal frame** — the result envelope. Nothing else is ever written to stdout. Diagnostics go to stderr.
- Every RPC / device call is bounded by `--timeout` (milliseconds, default `config.timeoutMs`, built-in 60000).

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
`migration_required`.

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
  "chain": { "family": "tron", "network": "tron:nile", "chainId": "nile" }
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
  "chain": { "family": "tron", "network": "tron:nile", "chainId": "nile" }
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
| `meta.pagination` | object                   | paginated commands only | `offset` / `limit` / `total`; present where `--limit` / `--offset` apply — see [pagination](#pagination) |
| `chain`           | object                   | chain commands only | `family` / `network` / `chainId`; neutral commands (`list`, `config`, …) omit it |

Encoding rules: `bigint` values are serialized as decimal **strings** (e.g. `"balance": "1976489000"`), binary as hex. Treat every on-chain amount as a string.

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

Every command that takes `--limit` / `--offset` reports the window it returned in `meta.pagination`, never inside `data`:

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

The **exit code is the hard contract**: `2` means the call was malformed (it will still be wrong on retry), `1` means execution failed (network / device / chain / wallet). `error.code` is a machine-readable string that refines the exit code — branch on the exit code first, then optionally on `error.code`. The code set is **open and non-exhaustive**: it grows as commands are added, and a few strings (e.g. `invalid_value`, `aborted`) can appear under either exit code depending on where they are raised. Always tolerate an unknown code by falling back to its exit-code class.

Common codes at exit **2** (usage — fix the call):

| Code | Meaning |
|---|---|
| `usage_error` | Unknown / missing / conflicting flags (raised by the parser) |
| `missing_option` | A required flag was not provided |
| `invalid_option` | A flag was used in an invalid combination |
| `invalid_value` | A flag value failed validation (e.g. `config defaultOutput xml`) |
| `invalid_amount` | An amount is malformed or out of range |
| `invalid_secret` | A supplied mnemonic / private key is malformed |
| `weak_password` | Master password below policy (≥8 chars; upper + lower + digit + special) |
| `tty_required` | An interactive prompt is needed but no TTY is attached — pass the matching `*-stdin` flag |
| `missing_network` / `unsupported_network` | `--network` absent, or not a known canonical id |
| `unknown_command` | No such command |
| `output_exists` | Target file already exists and is never overwritten (`backup --out`, `address generate --out`). Deterministic — retrying the same path always fails |
| `file_not_found` | An input file named by a flag does not exist (`contract create2 --code-file`) |
| `keystore_not_found` | `import keystore`: no file at the given path |
| `invalid_keystore` | `import keystore`: not a valid Web3 V3 keystore — bad JSON, `version` ≠ 3, an unsupported cipher/KDF, or a payload that is not a 32-byte private key |
| `invalid_config` | `config.yaml` cannot be read or is not valid YAML — fix or remove the file. The parser detail is withheld: it quotes the offending line, which may carry a credential |
| `insecure_config` | `config.yaml` holds service credentials but is a symlink or is group/world-readable — run `chmod 600` on it (POSIX only; not enforced on Windows) |
| `token_not_in_book` / `token_is_official` / `token_metadata_unavailable` | Token address-book conditions |
| `unknown_parameter` | No chain parameter by that name or id (`proposal create --set`) |
| `invalid_asset_name` | A TRC10 name or abbreviation outside 1–32 visible ASCII characters |

Common codes at exit **1** (execution — runtime failure):

| Code | Meaning |
|---|---|
| `rpc_error` | The TRON node rejected or failed the request |
| `invalid_node_response` | The node's answer contradicts the request or the protocol: a TRC10/exchange record whose id is not the one asked for, a `precision` outside 0..6, or a rate pair that is not a positive int32. These decide signed amounts, so the command stops rather than acting on them. List reads drop the offending record and keep the page |
| `timeout` | Aborted waiting for network or device (`--timeout` exceeded) |
| `auth_required` | Master password required but not supplied |
| `auth_failed` | Wrong master password (decryption failed) |
| `signing_rejected` / `transaction_rejected` | Signing or broadcast rejected (device or chain) |
| `watch_only_no_signer` | The account is watch-only and cannot sign |
| `wrong_device_seed` | Connected Ledger does not match the registered account |
| `tx_integrity` / `invalid_transaction` | A presigned transaction failed integrity / validity checks |
| `insufficient_balance` / `insufficient_token_balance` | Not enough TRX / token to cover the amount plus fees |
| `provider_error` | An external service (GasFree, TronLink multi-sig) returned an error or rate-limited |
| `gasfree_credentials_missing` / `tronlink_credentials_missing` | Required service credentials are not configured (set them with `config`) |
| `tx_expired` | The transaction's expiration passed before signatures were collected |
| `history_not_supported` | The endpoint lacks TronGrid history support |
| `not_found` | The addressed thing does not exist — an unactivated account, a contact, a chain parameter, a GasFree or TronLink resource. Lookups that have a group of their own use the specific code below |
| `proposal_not_found` / `contract_not_found` / `asset_not_found` / `exchange_not_found` | Nothing on chain under that proposal id, contract address, TRC10 reference, or exchange pair id |
| `ambiguous_asset_name` | A TRC10 name matches more than one token; `error.details` carries the candidates — see [`error.details.matches`](#errordetailsmatches) |
| `ledger_unsupported` | The Ledger TRON app cannot sign this contract type — refused before the device is touched (`asset` writes, `witness` writes) |
| `not_a_witness` / `already_witness` / `not_proposal_owner` | Governance identity does not meet the operation's rule |
| `already_approved` / `not_approved` / `proposal_expired` / `already_canceled` | Proposal voting conditions |
| `account_not_active` / `chain_parameter_unavailable` | `witness create`: the account is not activated on chain, or the node did not return `getAccountUpgradeCost` |
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

Unexpected exceptions are **redacted** to `internal_error` with a generic message, so a library error that happens to echo secret material can never reach the envelope. This list is representative, not exhaustive — new codes may be added within v1.

### `error.details.matches`

Some failures are a **choice**, not a dead end: the call was well formed but names something that resolves to several candidates, and the caller has to pick one. Those errors put the candidates in `error.details.matches` — an array of flat objects sharing one key set:

```json
{"code":"ambiguous_asset_name","message":"2 TRC10 tokens are named MyToken; re-run with the id","details":{"name":"MyToken","assetIds":["1000123","1000488"],"matches":[{"assetId":"1000123","issuerAddress":"TQkXm4vN...","totalSupply":"1000000000000000","precision":6},{"assetId":"1000488","issuerAddress":"TZx9kP2m...","totalSupply":"5000000000","precision":2}]}}
```

`matches` is the convention, not a per-code special case: **any** error may carry it, and any that does gets the same treatment. In text mode the candidates are printed as a table under the `error [...]` line, on stderr. Quantities inside `matches` stay raw (minimal units), matching how the corresponding success payload reports them; the text table scales them for display when the row carries a `precision`.

Alongside it, an error may carry a scalar list of just the identifiers to retry with — `assetIds` above. Prefer that for scripting; `matches` exists so a human can tell the candidates apart.

## Secret handling

Secrets never travel via argv or environment variables — they would leak into shell history and process listings. Two channels only:

1. **stdin flags** — `--password-stdin`, `--tx-stdin`, `--message-stdin`. **Only one `*-stdin` flag can consume stdin per run.** (Mnemonics and private keys have no stdin path — `import mnemonic` / `import private-key` / `change-password` are interactive-only, hidden TTY input.)
2. **Interactive TTY prompt** — when running with a terminal attached.

```bash
# non-interactive unlock
printf '%s' "$MASTER_PASSWORD_FROM_YOUR_VAULT" | wallet-cli tx send \
  --to TSx72ViULFepRGCS4PM5dP4FqD1d8qggCc --amount 1 \
  --network tron:nile --password-stdin -o json
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
   | `confirmed` | Solidified on chain (`blockNumber` present) | yes |
   | `failed` | Included and reverted / rejected | yes |
   | `pending` | Seen but not yet solidified | no — keep polling |
   | `not_found` | Unknown to the queried node | no — keep polling until your own deadline, then treat as failed |

   `data.confirmed` and `data.failed` are provided as booleans for direct branching.

   **GasFree transfers are the exception.** `gasfree transfer` submits to a provider, not directly to a node: the submitted receipt carries a `traceId` (not a `txId`), and progress follows the provider's states — `WAITING` → `INPROGRESS` → `CONFIRMING` → `SUCCEED` / `FAILED`. Follow it with `--wait` or [`gasfree trace <traceId>`](commands/gasfree/trace.md) rather than `tx status`; a `txId` appears only once the provider puts it on-chain.

```bash
txid=$(wallet-cli tx send --to T... --amount 1 --network tron:nile --password-stdin -o json \
        < pw.fifo | jq -r '.data.txId') || exit 1
until [ "$(wallet-cli tx status --txid "$txid" --network tron:nile -o json | jq -r '.data.state')" = confirmed ]; do
  sleep 3   # add your own deadline; 'failed' should abort, not loop
done
```

4. **Batch operations**: each command is one transaction with one exit code. Stop-on-first-failure is the default safe posture; if you continue, track per-item txids and reconcile with `tx status` before reporting success.

## Stability promise (v1)

Guaranteed stable while `schema` is `wallet-cli.result.v1`:

- envelope field names and semantics as tabled above;
- exit-code mapping 0/1/2;
- one-terminal-frame stdout discipline in JSON mode;
- existing `error.code` values keep their meaning (new codes may be added);
- canonical command ids and network ids (`tron:mainnet`, `tron:nile`, `tron:shasta`).

Not covered: text-mode output, `error.message` wording, field ordering, `meta.durationMs` values, and any field marked best-effort on a command's reference page (e.g. `priceUsd` in `account portfolio`).

## See also

- [Scripting guide](guide/scripting.md) — a gentler introduction
- [Command reference](commands/index.md) — per-command `data` payloads
- [Troubleshooting](troubleshooting.md) — human-facing remedies, keyed by the error codes above
