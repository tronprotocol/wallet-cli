# wallet-cli tx broadcast

Broadcast a presigned transaction.

## Synopsis

```
wallet-cli tx broadcast (--transaction <json> | --tx-stdin) --network <id> [options]
```

## Description

Submits a transaction that was signed elsewhere — typically the `data.signed` object from [`tx send --sign-only`](send.md) on an offline or key-holding machine. No wallet unlock is needed; the transaction is already signed.

A presigned transaction carries no network of its own, so pass `--network` to say which network to broadcast to (falls back to the config default network when omitted). Exactly one of `--transaction` / `--tx-stdin`.

## Options

| Option | Description |
|---|---|
| `--transaction <string>` | Signed TRON transaction JSON inline |
| `--tx-stdin` | Read the signed transaction JSON from stdin (fd 0) |
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

```console
$ wallet-cli tx broadcast --tx-stdin --network tron:nile < signed.json
⏳ Broadcast
  TxID    72a315303323125708f426c77b94c5215afd8964ed27d67e49c29b56e29078f5
  Status  pending — not yet on-chain
! Track it: wallet-cli tx info --network tron:nile --txid 72a315303323125708f426c77b94c5215afd8964ed27d67e49c29b56e29078f5
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"tron.tx.broadcast","data":{"kind":"broadcast","stage":"submitted","txId":"72a315303323125708f426c77b94c5215afd8964ed27d67e49c29b56e29078f5"},"meta":{"durationMs":926,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind`, `stage: "submitted"`, `txId` |
| `--wait` (confirmed/failed) | above, plus `confirmed`, `blockNumber`, `failed`, and result fields |

As with `tx send`, the default return point is **submission** — confirm via `--wait` or [`tx status`](status.md).

## Exit status

`0` submitted · `1` execution failure (node rejected the tx, timeout) · `2` usage error (both/neither transaction sources).

## See also

[`tx send --sign-only`](send.md) · [`tx status`](status.md) · [Scripting guide](../../guide/scripting.md#sign-here-broadcast-there)
