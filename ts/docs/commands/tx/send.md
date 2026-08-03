# wallet-cli tx send

Send native TRX or TRC20/TRC10 tokens with human `--amount`.

## Synopsis

```
wallet-cli tx send --to <address|contact> (--amount <n> | --raw-amount <n>)
                   [--token <symbol> | --contract <address> | --asset-id <id>]
                   [--dry-run | --sign-only | --build-only] [--fee-limit <sun>] [options]
```

## Description

Builds, signs, and submits a transfer from the active account (or `--account`). What is sent depends on which selector you pass:

- **none** → native TRX;
- `--token <symbol>` → token resolved from the local address book;
- `--contract <address>` → TRC20 by contract address;
- `--asset-id <id>` → TRC10 by numeric asset id.

`--to` accepts a TRON address or the name of a local [contact](../contact/index.md). When a contact
name resolves, the receipt shows both — `To  alice (TR7NHq…)` — and `data.toContact` carries the
name, so the resolution stays auditable rather than implicit.

Amounts: `--amount` is human units (TRX, or token units respecting the token's decimals); `--raw-amount` is the raw integer (SUN or token base units). Exactly one of the two.

Three early exits: `--dry-run` builds and estimates only — no signature, no broadcast, nothing leaves your machine; `--sign-only` signs and prints the transaction for a later [`tx broadcast`](broadcast.md); `--build-only` prints it unsigned, without ever unlocking the wallet, for [multi-party or offline signing](index.md).

**By default the command returns at submission** (`stage: "submitted"`), not confirmation — add `--wait` to block until confirmed/failed, or poll [`tx status`](status.md).

Requires an account. The master password (via `--password-stdin`) is needed only by the modes that sign — `--dry-run` and `--build-only` do not unlock the wallet and run without it. Signing commands do not show an interactive prompt, so a signing mode without the password fails with `auth_required`.

## Options

| Option | Description |
|---|---|
| `--to <string>` | **Required.** Recipient TRON base58 address, or a local [contact](../contact/index.md) name |
| `--amount <string>` | Human amount; mutually exclusive with `--raw-amount` |
| `--raw-amount <string>` | Raw integer amount in SUN / token base units |
| `--token <string>` | Token symbol from the address book; excludes `--contract`, `--asset-id` |
| `--contract <string>` | TRC20 contract address |
| `--asset-id <string>` | TRC10 numeric asset id |
| `--fee-limit <string>` | Max TRX energy fee to burn for TRC20 transfers, in SUN (default 100000000) |
| `--dry-run` | Build and estimate only |
| `--sign-only` | Sign without broadcasting |
| `--build-only` | Build and output the unsigned transaction hex **without unlocking** — the entry point for [multi-party or offline signing](index.md) |
| `--permission-id <0-9>` | TRON permission group id used to authorize this transaction (default `0`) |
| `--expiration <ms>` | Expiration duration in ms (1–86400000); only with `--sign-only` / `--build-only` |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default 60000; on cap returns the submitted receipt) |
| `--password-stdin` | Master password from stdin |

`--dry-run`, `--sign-only`, and `--build-only` are mutually exclusive.

Plus the [global options](../index.md#global-options-every-command).

## Examples

> **Password**: except for `--dry-run`, the examples below omit the password to keep the focus on the selector flags. A real send needs the master password on stdin — prefix with `printf '%s' "$PW" |` and append `--password-stdin` (see the description above).

```bash
# 1 TRX on Nile
wallet-cli tx send --to TSx72ViULFepRGCS4PM5dP4FqD1d8qggCc --amount 1 --network tron:nile

# TRC20 by address-book symbol; TRC10 by asset id
wallet-cli tx send --to T... --token USDT --amount 5 --network tron:nile
wallet-cli tx send --to T... --asset-id 1002000 --raw-amount 1000000 --network tron:nile

# rehearse without signing
wallet-cli tx send --to TSx72ViULFepRGCS4PM5dP4FqD1d8qggCc --amount 1 --network tron:nile --dry-run -o json
```

Submit receipt (default mode, text and json):

```bash
printf '%s' "$PW" | wallet-cli tx send --to TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH --amount 1 --network tron:nile --password-stdin
```

```console
⏳ Sent 1 TRX
  To      TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH
  TxID    4574b646adc694e99a1f64e548b2bdf9da62621c2d833f77354f67b751fbd0c4
  Status  pending — not yet on-chain
! Track it: wallet-cli tx info --network tron:nile --txid 4574b646adc694e99a1f64e548b2bdf9da62621c2d833f77354f67b751fbd0c4
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"tx.send","data":{"kind":"send","stage":"submitted","txId":"4574b646adc694e99a1f64e548b2bdf9da62621c2d833f77354f67b751fbd0c4","rawAmount":"1000000","to":"TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH"},"meta":{"durationMs":2172,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data` varies by mode:

| Mode | Fields |
|---|---|
| default (submit) | `kind: "send"`, `stage: "submitted"`, `txId`, `rawAmount` (string), `to`, plus `toContact` when `--to` was a contact name |
| `--wait` (confirmed) | the above, but `stage: "confirmed"`, plus `confirmed`, `blockNumber`, `netUsed` (bandwidth used) or `feeSun` (fee burned), `failed` |
| `--wait` (reverted) | the same fields, but `stage: "failed"` and `failed: true` — the transaction was mined and then reverted. **The envelope is still `success: true` at exit `0`**; a reverted transaction is a completed command, not a CLI failure, so scripts must branch on `data.stage` |
| `--dry-run` | `kind`, `mode: "dry-run"`, `fee` (`feeModel`, e.g. `bandwidthBurnSunIfNoFreeze`), unsigned `tx` (TRON tx object incl. `txID`, `raw_data`), `rawAmount`, `to` |
| `--sign-only` | `kind`, `mode: "sign-only"`, `signed` (full signed TRON tx incl. `signature[]` — feed to `tx broadcast`), `address` (signer), `txId`, `fee`, `rawAmount`, `to` |
| `--build-only` | `kind`, `mode: "build-only"`, unsigned `tx`, `hex` (complete protobuf artifact — feed to `tx sign`), `fee`, `rawAmount`, `to` |

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`rpc_error`, `timeout` — **on timeout the tx may still be in flight; check `tx status` before resending**) · `2` usage error (conflicting selectors/amounts/modes).

`0` also covers `--wait` reporting `stage: "failed"`: the exit code reflects the command, not the on-chain result. See [machine interface — script safety](../../machine-interface.md#script-safety-never-mistake-submitted-for-confirmed).

## See also

[`tx status`](status.md) · [`tx broadcast`](broadcast.md) · [Fees & resources](../../concepts/networks.md#fees-the-tron-resource-model) · [Script safety](../../machine-interface.md#script-safety-never-mistake-submitted-for-confirmed)
