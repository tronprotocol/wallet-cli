# wallet-cli tx broadcast

Validate and broadcast a presigned JSON or protobuf-hex transaction.

## Synopsis

```
wallet-cli tx broadcast (--transaction <json> | --tx-stdin | --hex <hex> | --file <path>)
                        --network <id> [--dry-run] [options]
```

## Description

Submits a transaction that was signed elsewhere — typically the `data.signed` object from [`tx send --sign-only`](send.md) on an offline or key-holding machine, or a co-signed hex artifact from [`tx sign --out`](sign.md). No wallet unlock is needed; the transaction is already signed.

A presigned transaction carries no network of its own, so pass `--network` to say which network to broadcast to (falls back to the config default network when omitted). Exactly one of `--transaction` / `--tx-stdin` / `--hex` / `--file`.

### Validation before submission

Broadcasting is not blind. Whatever form the transaction arrives in, it is decoded and checked
first, and a transaction that cannot succeed is rejected locally instead of being sent:

- **expired** → `tx_expired`
- **insufficient signature weight** → `not_authorized`, naming the missing weight

That check is what makes this safe as the last step of a multi-signature workflow: a transaction
that has not yet reached its permission threshold never reaches the node.

### `--dry-run`

Runs exactly those checks — signatures, threshold, expiration, and the dynamic multi-sign fee — and
reports the approval state **without broadcasting**. Use it to confirm a collected transaction is
complete before committing it. `--dry-run` cannot be combined with `--wait`.

A transaction carrying more than one signature also incurs TRON's multi-sign fee; it is reported as
`multiSignFeeSun` in both dry-run and real broadcasts.

## Options

| Option | Description |
|---|---|
| `--transaction <string>` | Signed TRON transaction JSON inline |
| `--tx-stdin` | Read the signed transaction JSON from stdin (fd 0) |
| `--hex <string>` | Complete signed `protocol.Transaction` hex |
| `--file <path>` | Read the signed transaction hex from a file (size-capped, just over 1 MiB) |
| `--dry-run` | Validate signatures, threshold, expiration, and multi-sign fee without broadcasting |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default 60000) |

Plus the [global options](../index.md#global-options-every-command).

## Examples

Two-machine flow:

```bash
# Signer (offline / key-holding): --sign-only emits the signed tx under data.signed
wallet-cli tx send --to T... --amount 1 --network tron:nile --sign-only -o json

# Take the data.signed object from that output, save it as signed.json, copy to the broadcaster

# Broadcaster: read from stdin and broadcast
wallet-cli tx broadcast --tx-stdin --network tron:nile < signed.json
```

Broadcast receipt (text and json):

```bash
wallet-cli tx broadcast --tx-stdin --network tron:nile < signed.json
```

```console
⏳ Broadcast
  TxID    72a315303323125708f426c77b94c5215afd8964ed27d67e49c29b56e29078f5
  Status  pending — not yet on-chain
! Track it: wallet-cli tx info --network tron:nile --txid 72a315303323125708f426c77b94c5215afd8964ed27d67e49c29b56e29078f5
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"tx.broadcast","data":{"kind":"broadcast","stage":"submitted","txId":"72a315303323125708f426c77b94c5215afd8964ed27d67e49c29b56e29078f5"},"meta":{"durationMs":926,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

Broadcast the co-signed artifact at the end of a multi-signature flow, checking it first:

```bash
wallet-cli tx broadcast --file signed.hex --network tron:nile --dry-run
wallet-cli tx broadcast --file signed.hex --network tron:nile
```

An incomplete transaction is refused locally, before the node ever sees it:

```console
error [not_authorized]: signature threshold is not reached; missing 1 weight
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind`, `stage: "submitted"`, `txId` |
| `--wait` (confirmed/failed) | above, plus `confirmed`, `blockNumber`, `failed`, and result fields |
| `--dry-run` | `kind`, `mode: "dry-run"`, no `txId` — nothing was submitted |

All stages additionally carry:

| Field | Type | Meaning |
|---|---|---|
| `transaction` | object | Approval state of the decoded transaction — the same shape [`tx approvals`](approvals.md) returns |
| `multiSignFeeSun` | number | Multi-sign fee in SUN; `0` for a single-signature transaction |

As with `tx send`, the default return point is **submission** — confirm via `--wait` or [`tx status`](status.md).

## Exit status

`0` submitted (or dry-run) · `1` execution failure — `tx_expired`, `not_authorized` (threshold not
reached), node rejection, timeout · `2` usage error — no transaction source, more than one source,
`--dry-run` with `--wait`, malformed JSON.

## See also

[`tx send --sign-only`](send.md) · [`tx sign`](sign.md) · [`tx approvals`](approvals.md) ·
[`tx status`](status.md) · [Scripting guide](../../guide/scripting.md#sign-here-broadcast-there)
