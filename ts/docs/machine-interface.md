# Machine Interface

The formal contract for calling wallet-cli from scripts, CI pipelines, and AI agents. This page is the **single authority** for the JSON envelope, exit codes, error codes, and secret handling. Everything here is covered by the `wallet-cli.result.v1` stability promise unless explicitly marked otherwise.

## Calling convention

```bash
wallet-cli <command> -o json [--network <id>] [--timeout <ms>] [--account <id|label>]
```

- Always pass `-o json`. Text output is for humans and carries no stability promise.
- In JSON mode, stdout carries **exactly one terminal frame** — the result envelope. Nothing else is ever written to stdout. Diagnostics go to stderr.
- Every RPC / device call is bounded by `--timeout` (milliseconds, default `config.timeoutMs`, built-in 60000).

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
  "command": "tron.account.balance",
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
  "command": "tron.tx.info",
  "error": { "code": "rpc_error", "message": "TRON getTransaction failed: Transaction not found" },
  "meta": { "durationMs": 1033, "warnings": [] },
  "chain": { "family": "tron", "network": "tron:nile", "chainId": "nile" }
}
```

| Field | Type | Presence | Notes |
|---|---|---|---|
| `schema` | `"wallet-cli.result.v1"` | always | Version gate; dispatch on this |
| `success` | boolean | always | Mirrors the exit code (`true` ⇔ 0) |
| `command` | string | always | Canonical command id, e.g. `tron.tx.send`, `list` |
| `data` | object/array | success only | Command-specific payload; see each command's reference page |
| `error.code` | string | error only | Machine-readable; see [error codes](#error-codes) |
| `error.message` | string | error only | Human-readable; **not** stable — never parse it |
| `error.details` | object | optional | Structured extras when available |
| `meta.durationMs` | number | always | Wall time |
| `meta.warnings` | string[] | always | Non-fatal notices |
| `chain` | object | chain commands only | `family` / `network` / `chainId`; neutral commands (`list`, `config`, …) omit it |

Encoding rules: `bigint` values are serialized as decimal **strings** (e.g. `"balance": "1976489000"`), binary as hex. Treat every on-chain amount as a string.

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
| `output_exists` | Target file already exists and is never overwritten (e.g. `backup --out`) |
| `token_not_in_book` / `token_is_official` / `token_metadata_unavailable` | Token address-book conditions |

Common codes at exit **1** (execution — runtime failure):

| Code | Meaning |
|---|---|
| `rpc_error` | The TRON node rejected or failed the request |
| `timeout` | Aborted waiting for network or device (`--timeout` exceeded) |
| `auth_required` | Master password required but not supplied |
| `auth_failed` | Wrong master password (decryption failed) |
| `signing_rejected` / `transaction_rejected` | Signing or broadcast rejected (device or chain) |
| `watch_only_no_signer` | The account is watch-only and cannot sign |
| `wrong_device_seed` | Connected Ledger does not match the registered account |
| `tx_integrity` / `invalid_transaction` | A presigned transaction failed integrity / validity checks |
| `history_not_supported` | The endpoint lacks TronGrid history support |
| `internal_error` | Unexpected internal failure; message is intentionally generic |

Unexpected exceptions are **redacted** to `internal_error` with a generic message, so a library error that happens to echo secret material can never reach the envelope. This list is representative, not exhaustive — new codes may be added within v1.

## Secret handling

Secrets never travel via argv or environment variables — they would leak into shell history and process listings. Two channels only:

1. **stdin flags** — `--password-stdin`, `--tx-stdin`, `--message-stdin`. **Only one `*-stdin` flag can consume stdin per run.** (Since v0.1.1, mnemonics and private keys have no stdin path — `import mnemonic` / `import private-key` / `change-password` are interactive-only, hidden TTY input.)
2. **Interactive TTY prompt** — when running with a terminal attached.

```bash
# non-interactive unlock
printf '%s' "$MASTER_PASSWORD_FROM_YOUR_VAULT" | wallet-cli tx send \
  --to TSx72ViULFepRGCS4PM5dP4FqD1d8qggCc --amount 1 \
  --network tron:nile --password-stdin -o json
```

## Script safety: never mistake "submitted" for "confirmed"

This is a wallet; a wrong success check loses money. The rules:

1. `tx send` **by default returns after submission**, not confirmation. The payload carries `"stage": "submitted"` and the `txId`:

   ```json
   { "kind": "send", "stage": "submitted", "txId": "7d9b6a08…", "rawAmount": "1000000", "to": "TSx72…" }
   ```

2. To block until the outcome is known, pass `--wait` (polls until confirmed/failed, capped by `--wait-timeout`, default 60000 ms; on cap it returns the submitted receipt).

3. Or poll yourself with `tx status`, which has a **four-state model**:

   | `data.state` | Meaning | Terminal? |
   |---|---|---|
   | `confirmed` | Solidified on chain (`blockNumber` present) | yes |
   | `failed` | Included and reverted / rejected | yes |
   | `pending` | Seen but not yet solidified | no — keep polling |
   | `not_found` | Unknown to the queried node | no — keep polling until your own deadline, then treat as failed |

   `data.confirmed` and `data.failed` are provided as booleans for direct branching.

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
