# wallet-cli gasfree trace

Track a GasFree transfer by provider trace id.

## Synopsis

```
wallet-cli gasfree trace <traceId> [options]
```

## Description

A GasFree transfer is not on-chain when it is accepted — the provider queues it, then broadcasts.
[`gasfree transfer`](transfer.md) returns a `traceId`; this command turns that id into the current
state.

| State | Meaning |
|---|---|
| `WAITING` | Accepted, not yet picked up |
| `INPROGRESS` | Being processed by the provider |
| `CONFIRMING` | Broadcast, awaiting chain confirmation |
| `SUCCEED` | Terminal — on chain, `txId` is populated |
| `FAILED` | Terminal — `failureReason` explains why |

Once the transfer settles, the reported amount and fees switch from the estimates to the **actual**
settled values, so a completed trace is the authoritative record of what was deducted.

No wallet unlock and no signing; it only needs GasFree credentials and the trace id. Because it is
wallet-independent, you can track a transfer from a machine that holds no keys.

## Arguments

- `traceId` — the provider trace id returned by [`gasfree transfer`](transfer.md) (positional)

## Options

Only the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli gasfree trace 7f3e9a02-58c1-4d2e-b6a4-91d0c3f8e527 --network tron:nile
```

```console
Trace ID        7f3e9a02-58c1-4d2e-b6a4-91d0c3f8e527
Status          succeed
TxID            5b1c0d9e7a4f2c8b6d3e1a0f9c7b5d3a1e8f6c4b2d0a9e7c5b3d1f8a6c4e2b0d
Token           USDT
Amount          25 USDT
Service fee     1 USDT
Activation fee  0 USDT
Total           26 USDT
To              TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
```

Poll until terminal in a script:

```bash
until wallet-cli gasfree trace "$TRACE" -o json \
  | jq -e '.data.state == "SUCCEED" or .data.state == "FAILED"' >/dev/null; do
  sleep 5
done
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `traceId` | string | Provider trace id |
| `state` | string | `WAITING` \| `INPROGRESS` \| `CONFIRMING` \| `SUCCEED` \| `FAILED` |
| `txId` | string | On-chain transaction hash — present once broadcast |
| `token` | string | Token symbol |
| `tokenAddress` | string | Token contract address |
| `decimals` | number | Token decimals |
| `amount` | string | Settled amount if available, else the submitted amount (base units) |
| `serviceFee` | string | Settled or estimated transfer fee (base units) |
| `activateFee` | string | Settled or estimated activation fee (base units) |
| `totalDeducted` | string | Total taken from the GasFree address (base units) |
| `from` | string | GasFree address the tokens left |
| `owner` | string | Account that authorized the transfer |
| `to` | string | Recipient |
| `nonce` | string | Authorization nonce |
| `failureReason` | string | Present only when `state` is `FAILED` |

## Exit status

`0` — including for a `FAILED` transfer: the *query* succeeded, so check `data.state` rather than
the exit code · `1` execution failure (`gasfree_integrity`, provider unreachable, unknown trace
id) · `2` usage error (malformed trace id, `unsupported_network`).

## See also

[`gasfree transfer`](transfer.md) · [`gasfree info`](info.md) · [`tx status`](../tx/status.md)
