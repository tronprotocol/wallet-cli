# wallet-cli tx broadcast

Broadcast a presigned transaction.

## Synopsis

```
wallet-cli tx broadcast (--hex <hex> | --file <path> | --transaction <json> | --tx-stdin)
                        [--dry-run] --network <id> [options]
```

## Description

Submits a transaction that was signed elsewhere, on TRON or EVM networks alike. No wallet unlock is needed; the transaction is already signed. The signed input can be **hex** — `--hex` inline or `--file` from a file (the format emitted by `--sign-only` and `tx sign`; protobuf on TRON, RLP `0x02…` on EVM) — or **JSON** — `--transaction` inline or `--tx-stdin` from stdin, both **TRON only**. Exactly one of the four; prefer `--file` for long hex.

A presigned transaction carries no network of its own, so pass `--network` to say which network to broadcast to (falls back to the config default network when omitted).

### Validation before submission

Broadcasting is not blind. Whatever form the transaction arrives in, it is decoded and checked first, and a transaction that cannot succeed is rejected locally instead of being sent.

**TRON:**

- **expired** → `tx_expired`
- **insufficient signature weight** → `not_authorized`, naming the missing weight

That check is what makes this safe as the last step of a multi-signature workflow: a transaction that has not yet reached its permission threshold never reaches the node.

> A transaction with more than one signature incurs an extra **1 TRX multi-sig fee** on-chain at broadcast; it is reported as `multiSignFeeSun` in both dry-run and real broadcasts.

**EVM:**

- **unsigned** → `invalid_transaction`
- **built for another chain** → `chain_id_mismatch`, naming both chain ids

The reported `txId` is derived from the transaction's own bytes, never taken from the node — the hash of a signed transaction is a property of the transaction, and a node that names a different one is not allowed to redirect what you poll.

`--dry-run` on EVM resolves the three things that actually stop a signed transaction, and returns them as a `checks` array (`signature`, `chainId`, `nonce`, `balance`):

- a **spent nonce** → `nonce_too_low`, exit 1
- a **balance below value + fee ceiling** → `insufficient_balance`, exit 1
- a **nonce ahead of the account's next** is not fatal — it is reported as a `warning` check plus a `meta.warnings` entry, because the transaction is valid and simply stays queued until the gap is filled

If the node cannot be reached, the nonce and balance checks degrade to `status: "skipped"` with a warning rather than failing the command.

## Options

| Option | Description |
|---|---|
| `--hex <hex>` | Signed transaction hex inline |
| `--file <path>` | File containing the signed transaction hex (size-capped at just over 1 MiB) |
| `--transaction <string>` | **TRON only.** Signed transaction JSON inline |
| `--tx-stdin` | **TRON only.** Read the signed transaction JSON from stdin (fd 0) |
| `--dry-run` | Validate **without broadcasting** — signatures, threshold, expiration and the dynamic multi-sig fee on TRON; signature, chain id, nonce and balance on EVM. Cannot be combined with `--wait` |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default 60000) |

Plus the [global options](../index.md#global-options-every-command).

## Examples

Broadcast a signed hex from a file:

```bash
wallet-cli tx broadcast --file tx.signed.hex --network tron:nile
```

```console
⏳ Broadcast
  TxID    72a315303323125708f426c77b94c5215afd8964ed27d67e49c29b56e29078f5
  Status  pending — not yet on-chain
! Track it: wallet-cli tx info --network tron:nile --txid 72a315303323125708f426c77b94c5215afd8964ed27d67e49c29b56e29078f5
```

Or inline hex, and the JSON receipt:

```bash
wallet-cli tx broadcast --hex 0a02...9f31 --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"tx.broadcast","data":{"kind":"broadcast","stage":"submitted","txId":"72a315303323125708f426c77b94c5215afd8964ed27d67e49c29b56e29078f5"},"meta":{"durationMs":926,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind`, `stage: "submitted"`, `txId` |
| `--wait` (confirmed/failed) | above, plus `confirmed`, `blockNumber`, `failed`, and result fields — `netUsed` / `feeSun` on TRON, `gasUsed` / `feeWei` / `effectiveGasPriceWei` on EVM |
| `--dry-run` (EVM) | `kind`, `mode: "dry-run"`, `txId`, `hash`, `address` (recovered signer), `to`, `rawAmount`, `fee` (`feeModel`, `maxCostWei`, `gasLimit`, `maxPerGasWei`), `tx`, and `checks[]` (`name`, `status` — `ok` / `warning` / `skipped` — and `detail`) |

On EVM a node that already knows the transaction sets `alreadyKnown: true` on the submitted receipt rather than failing.

As with `tx send`, the default return point is **submission** — confirm via `--wait` or [`tx status`](status.md).

## Exit status

`0` submitted · `1` execution failure (node rejected the tx, timeout; `tx_expired` / `not_authorized` on TRON; `invalid_transaction`, `chain_id_mismatch`, `nonce_too_low`, `insufficient_balance` on EVM) · `2` usage error (more than one, or none, of the input sources; `invalid_option` for `--transaction` / `--tx-stdin` on an EVM network).

Note that `--dry-run` exits **non-zero** on a transaction that would fail — that is the answer a script is asking for.

## See also

[`tx send --sign-only`](send.md) · [`tx status`](status.md) · [Scripting guide](../../guide/scripting.md#sign-here-broadcast-there)
