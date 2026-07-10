# wallet-cli contract send

State-changing contract call (triggerSmartContract).

## Synopsis

```
wallet-cli contract send --contract <address> --method <sig> [--params <json>]
                         [--call-value-sun <n>] [--fee-limit <sun>]
                         [--dry-run | --sign-only] [--wait [--wait-timeout <ms>]] [options]
```

## Description

Builds, signs, and broadcasts a state-changing contract call from the active account (or `--account`). Parameters follow the same `{type,value}` JSON-array convention as [`contract call`](call.md); `--call-value-sun` attaches native TRX to the call.

Two early exits: `--dry-run` previews the energy cost (estimateEnergy) without signing or broadcasting; `--sign-only` signs and prints the transaction for a later [`tx broadcast`](../tx/broadcast.md).

**By default the command returns at submission** (`stage: "submitted"`) — add `--wait` to block until confirmed/failed. With `--wait`, an on-chain execution failure (revert / `OUT_OF_ENERGY`) comes back as `stage: "failed"` with the `result` reason.

Requires an account and the master password via `--password-stdin`; watch-only accounts fail with `watch_only_no_signer`.

## Options

| Option | Description |
|---|---|
| `--contract <string>` | **Required.** Contract address |
| `--method <string>` | **Required.** Function signature, e.g. `transfer(address,uint256)` |
| `--params <string>` | JSON array of ABI parameters as `{type,value}` |
| `--call-value-sun <number>` | Native TRX attached to the call, in SUN (default 0) |
| `--fee-limit <number>` | Max energy fee to burn, in SUN (default 100000000) |
| `--dry-run` | Estimate energy only, no signature/broadcast; excludes `--sign-only` |
| `--sign-only` | Sign without broadcasting; excludes `--dry-run` |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--password-stdin` | Master password from stdin |

Plus the [global options](../index.md#global-options-every-command).

## Examples

Default — broadcasts and returns the **submitted** receipt:

```console
$ echo "$PW" | wallet-cli contract send --contract TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf \
    --method "transfer(address,uint256)" \
    --params '[{"type":"address","value":"TSx72ViULFepRGCS4PM5dP4FqD1d8qggCc"},{"type":"uint256","value":"1000000"}]' \
    --network tron:nile --password-stdin
⏳ Called transfer
  TxID    c8d...
  Status  pending — not yet on-chain
! Track it: wallet-cli tx info --network tron:nile --txid c8d...
```

```console
$ echo "$PW" | wallet-cli contract send --contract TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf \
    --method "transfer(address,uint256)" --params '[...]' --network tron:nile --password-stdin -o json
{"schema":"wallet-cli.result.v1","success":true,"command":"tron.contract.send","data":{"kind":"contract-send","stage":"submitted","txId":"c8d...","method":"transfer(address,uint256)"},"meta":{"durationMs":15,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

With `--wait`, an on-chain failure (e.g. out of energy) returns `stage: "failed"`:

```console
$ echo "$PW" | wallet-cli contract send --contract TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf \
    --method "transfer(address,uint256)" --params '[...]' --network tron:nile --wait --password-stdin
❌ Called transfer
  TxID    c8d...
  Block   #66,000,123
  Energy  31,200
  Status  failed
  Reason  OUT_OF_ENERGY
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind: "contract-send"`, `stage: "submitted"`, `txId`, `method` |
| `--wait` (confirmed/failed) | above, plus `confirmed`, `blockNumber`, `energyUsed`, `result` (e.g. `OUT_OF_ENERGY`), `failed` |

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`watch_only_no_signer`, `wrong_password`, `rpc_error`, `timeout` — on timeout the tx may still be in flight; check [`tx status`](../tx/status.md)) · `2` usage error (`invalid_value`, conflicting modes).

## See also

[`contract call`](call.md) · [`contract deploy`](deploy.md) · [`tx broadcast`](../tx/broadcast.md) · [Energy & bandwidth](../../concepts/energy-bandwidth.md)
