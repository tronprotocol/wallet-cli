# wallet-cli contract send

State-changing contract call.

## Synopsis

```
wallet-cli contract send --contract <address> --method <sig> [--params <json>] [--value <n>]
                         [--dry-run | --sign-only | --build-only | --wait [--wait-timeout <ms>]]
                         [--fee-limit <sun>] [--permission-id <n>] [--expiration <ms>]        # TRON
                         [--gas-limit <n>] [--max-fee <gwei>] [--priority-fee <gwei>] [--nonce <n>]  # EVM
                         [options]
```

## Description

Builds, signs, and broadcasts a state-changing contract call from the active account (or `--account`), on TRON or EVM. Parameters follow the same `{type,value}` JSON-array convention as [`contract call`](call.md); the signature and types are supplied explicitly, no ABI is consulted.

`--value` attaches native coin to the call, in **whole coins** (`1.5`, not the base unit). TRON's `--call-value-sun` still works and takes SUN, but it is **deprecated and removed next release** — use `--value`.

Two early exits: `--dry-run` previews the cost without signing or broadcasting — energy on TRON, a gas ceiling on EVM; `--sign-only` signs and prints the transaction for a later [`tx broadcast`](../tx/broadcast.md), and `--build-only` prints it unsigned.

Fee flags follow the family — `--fee-limit` / `--permission-id` / `--expiration` on TRON, `--gas-limit` / `--max-fee` / `--priority-fee` / `--nonce` on EVM. Help tags each set, and using one on the other family is refused with `invalid_option`.

**By default the command returns at submission** (`stage: "submitted"`) — add `--wait` to block until confirmed/failed. With `--wait`, an on-chain execution failure comes back as `stage: "failed"` — with the `result` reason on TRON (revert / `OUT_OF_ENERGY`), and with the receipt's failed status on EVM.

Requires an account. The master password (via `--password-stdin`) is needed only by the modes that sign — `--dry-run` and `--build-only` do not unlock the wallet and run without it. Watch-only accounts fail with `watch_only_no_signer` in a signing mode.

## Options

| Option | Description |
|---|---|
| `--contract <string>` | **Required.** Contract address — base58 on TRON, `0x` on EVM |
| `--method <string>` | **Required.** Function signature, e.g. `transfer(address,uint256)` |
| `--params <string>` | JSON array of ABI parameters as `{type,value}` |
| `--value <string>` | Native coin sent with the call, in whole coins |
| `--dry-run` | Estimate only, no signature/broadcast; excludes `--sign-only` / `--build-only` |
| `--sign-only` | Sign without broadcasting, output the signed hex; excludes `--dry-run` / `--build-only` |
| `--build-only` | Build only, output the **unsigned** hex; excludes `--dry-run` / `--sign-only` |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--password-stdin` | Master password from stdin |

TRON only:

| Option | Description |
|---|---|
| `--call-value-sun <number>` | **Deprecated**, removed next release — native TRX attached to the call, in SUN. Use `--value` |
| `--fee-limit <number>` | Max energy fee to burn, in SUN (default 100000000) |
| `--permission-id <n>` | Permission group to sign with (0=owner, 1=witness, 2-9=active); default `0` |
| `--expiration <ms>` | Transaction expiration in ms, up to `86400000` (24h); only with `--sign-only` or `--build-only`; omitted = node default (~60s) |

EVM only:

| Option | Description |
|---|---|
| `--gas-limit <n>` | Gas units to authorise; default is the node's estimate, unpadded |
| `--max-fee <gwei>` | Maximum total fee per gas (EIP-1559 chains only) |
| `--priority-fee <gwei>` | Tip per gas (EIP-1559 chains only) |
| `--nonce <n>` | Transaction nonce; default is the account's pending nonce |

Plus the [global options](../index.md#global-options-every-command).

## Examples

In the examples, `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`.

Default — broadcasts and returns the **submitted** receipt:

```bash
echo "$PW" | wallet-cli contract send --contract TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf --method "transfer(address,uint256)" --params '[{"type":"address","value":"TSx72ViULFepRGCS4PM5dP4FqD1d8qggCc"},{"type":"uint256","value":"1000000"}]' --network tron:nile --password-stdin
```

```console
⏳ Called transfer
  TxID    c8d...
  Status  pending — not yet on-chain
! Track it: wallet-cli tx info --network tron:nile --txid c8d...
```

```bash
echo "$PW" | wallet-cli contract send --contract TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf --method "transfer(address,uint256)" --params '[...]' --network tron:nile --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"contract.send","data":{"kind":"contract-send","stage":"submitted","txId":"c8d...","method":"transfer(address,uint256)","contract":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"},"meta":{"durationMs":15,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

With `--wait`, blocks until confirmed — on success:

```bash
echo "$PW" | wallet-cli contract send --contract TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf --method "transfer(address,uint256)" --params '[...]' --network tron:nile --wait --password-stdin
```

```console
✅ Called transfer
  Contract  TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf
  TxID      0adc5737b724d35c486a05a169b64a01ad311ed27f79d308f245b00c69b3bc42
  Block     #69,095,391
  Energy    14,584
  Fee       0.345 TRX
  Status    success
```

An on-chain failure (e.g. out of energy) returns `stage: "failed"`:

```bash
echo "$PW" | wallet-cli contract send --contract TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf --method "transfer(address,uint256)" --params '[...]' --network tron:nile --wait --password-stdin
```

```console
❌ Called transfer
  TxID    c8d...
  Block   #66,000,123
  Energy  31,200
  Status  failed
  Reason  OUT_OF_ENERGY
```

## Output

`data` varies by stage:

| Mode | Fields |
|---|---|
| default (submit) | `kind: "contract-send"`, `stage: "submitted"`, `txId`, `method`, `contract` |
| `--wait` (confirmed/failed) | above, but `stage: "confirmed"` or `"failed"`, plus `confirmed`, `blockNumber`, `failed`, and the realised cost — `feeSun` / `energyUsed` / `result` (`SUCCESS`, `OUT_OF_ENERGY`, …) on TRON, `gasUsed` / `feeWei` / `effectiveGasPriceWei` on EVM |
| `--dry-run` | `kind`, `mode: "dry-run"`, `fee`, unsigned `tx` |
| `--sign-only` | `kind`, `mode: "sign-only"`, `hex` (signed transaction hex), `signed`, `address` (signer), `txId`, `fee`, `method`, `contract` |
| `--build-only` | `kind`, `mode: "build-only"`, `hex` (**unsigned** transaction hex), unsigned `tx`, `fee`, `method`, `contract` |

`signed` is the signed transaction in the chain's own form — a TRON transaction object including `signature[]`, or `{raw, hash}` on EVM.

The `fee` object is shaped by the network's fee model: `tron-resource` reports the estimated `energy` and `availableEnergy`; `eip1559` / `legacy` report `maxCostWei`, `gasLimit` and `maxPerGasWei`. On EVM `data` additionally carries `nonce`, and `hex` is a `0x` RLP encoding rather than protobuf.

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`watch_only_no_signer`, `auth_failed`, `rpc_error`, `timeout` — on timeout the tx may still be in flight; check [`tx status`](../tx/status.md)) · `2` usage error (`invalid_value`, conflicting modes; `invalid_option` when a `(tron only)` flag is used on EVM or vice versa).

## See also

[`contract call`](call.md) · [`contract deploy`](deploy.md) · [`tx broadcast`](../tx/broadcast.md) · [Energy & bandwidth](../../concepts/energy-bandwidth.md)
