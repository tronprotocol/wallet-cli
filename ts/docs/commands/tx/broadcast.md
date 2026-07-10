# wallet-cli tx broadcast

Broadcast a presigned transaction.

## Synopsis

```
wallet-cli tx broadcast (--transaction <json> | --tx-stdin) --network <id> [options]
```

## Description

Submits a transaction that was signed elsewhere — typically the `data.signed` object from [`tx send --sign-only`](send.md) on an offline or key-holding machine. No wallet unlock is needed; the transaction is already signed.

Requires `--network` explicitly. Exactly one of `--transaction` / `--tx-stdin`.

## Options

| Option | Description |
|---|---|
| `--transaction <string>` | Signed TRON transaction JSON inline |
| `--tx-stdin` | Read the signed transaction JSON from stdin (fd 0) |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default 60000) |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
# two-machine flow
wallet-cli tx send --to T... --amount 1 --network tron:nile --sign-only -o json \
  | jq -c '.data.signed' > signed.json                       # signer

wallet-cli tx broadcast --tx-stdin --network tron:nile -o json < signed.json   # broadcaster
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind`, `stage: "submitted"`, `txId` |
| `--wait` (confirmed/failed) | above, plus `confirmed`, `blockNumber`, `failed`, and result fields |

As with `tx send`, the default return point is **submission** — confirm via `--wait` or [`tx status`](status.md).

## Exit status

`0` submitted · `1` execution failure (node rejected the tx, timeout) · `2` usage error (both/neither transaction sources, missing `--network`).

## See also

[`tx send --sign-only`](send.md) · [`tx status`](status.md) · [Scripting guide](../../guide/scripting.md#sign-here-broadcast-there)
