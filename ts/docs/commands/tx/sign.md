# wallet-cli tx sign

Sign a transaction built elsewhere.

## Synopsis

```
wallet-cli tx sign (--hex <hex> | --file <path> | --transaction <json>) [--offline] [--out <path>] [options]
```

## Description

Signs a transaction that was built somewhere else — on TRON, adding the active account's signature to an unsigned or partially signed hex and reporting how far the accumulated signing weight is from the permission group's threshold; on EVM, producing the single signature the transaction takes.

Two input modes: with `--hex` / `--file` it signs the transaction hex (protobuf on TRON, RLP `0x02…` on EVM); with `--transaction` it takes unsigned TRON transaction JSON, preserving the direct single-signature flow. `--transaction` is a TRON compatibility path and never contacts a node.

**On EVM there is no co-signing.** An EVM transaction carries exactly one signature, so a hex that already has one is refused with `invalid_transaction`, and there is no threshold, weight or permission group to report. The chain id inside the transaction is checked against `--network` **before** signing (`chain_id_mismatch`) — a mainnet transaction handed to `--network sepolia` would otherwise come back validly signed for mainnet, and nothing downstream could catch it.

On TRON it is the on-chain co-signing path: an initiator produces a partially signed hex with `tx send --sign-only` (or any broadcast command in `--sign-only` mode), each co-signer runs `tx sign` in turn — passing the hex from person to person — and once the weight reaches the threshold, anyone broadcasts the final hex with [`tx broadcast --hex`](broadcast.md). All signatures must be collected before the transaction expires (default ~60s, up to 24h via `--expiration`).

Signing endorses the transaction with your key: the command shows no preview or confirmation, reads the master password from `--password-stdin`, and signs directly — to inspect a transaction without signing it, use [`tx approvals`](approvals.md). It does **not** broadcast, and has **no `--permission-id`** (the group is fixed in the transaction body; it's shown on the `Permission` line). Watch-only accounts fail with `watch_only_no_signer`.

### What is verified before signing

**TRON.** With `--hex` / `--file` the command contacts the node and refuses to sign unless this account is a key in the transaction's permission group (`not_authorized`) and has not already approved it (`already_signed`). Both are checked *before* a key is decrypted, so a mistaken signer never produces a signature at all.

`--offline` skips those two checks and never contacts a node — for signing machines with no network. Signature-eligibility errors then surface only when the transaction is broadcast, so confirm the signing account is in the group beforehand.

**EVM.** The transaction's chain id must match the selected network (`chain_id_mismatch`), and it must not already carry a signature (`invalid_transaction`). Both are local checks; no node is contacted to sign.

Payload integrity is checked in every mode, offline included. A TRON transaction states its content three times — `raw_data` (what you read), `raw_data_hex` (what the node executes), and `txID` (what the signature actually covers) — and nothing in the format forces them to agree, so a transaction whose `raw_data` reads "1 TRX" can carry the `txID` of a 1000 TRX transfer. `tx sign` therefore refuses (`tx_integrity`) unless `txID` is the sha256 of `raw_data_hex`, and `raw_data` re-encodes to exactly those bytes wherever the contract type can be decoded.

That three-way check is TRON's; an EVM transaction hashes its own bytes, so there is nothing to disagree.

Four contract types cannot be re-encoded by the bundled decoder — `UnfreezeAssetContract`, `ShieldedTransferContract`, `MarketSellAssetContract`, `MarketCancelOrderContract`. `--hex` / `--file` input carrying one is refused with `invalid_transaction`; sign those through `--transaction` JSON instead.

## Options

| Option | Description |
|---|---|
| `--hex <hex>` | **Required** (one of). Transaction hex — `protocol.Transaction` protobuf on TRON, RLP on EVM |
| `--file <path>` | **Required** (one of). File containing the transaction hex (prefer this for long hex) |
| `--transaction <json>` | **Required** (one of). **TRON only.** Unsigned TRON transaction JSON; compatibility path, never checked online |
| `--offline` | Sign locally without contacting a node; skips the signer-permission and approval-weight checks. Only meaningful on TRON — EVM signing contacts no node either way |
| `--out <path>` | Write the resulting hex to a file (mode 0644, written atomically) instead of stdout |

Plus the [global options](../index.md#global-options-every-command) and `--password-stdin`.

The transaction is passed on argv, not stdin: it is not a secret, and this leaves fd 0 free for `--password-stdin`.

## Examples

In the examples, `$PW` is your master password, fed on stdin via `--password-stdin`.

An initiator first produces a partially signed `tx.hex` with `tx send --sign-only`:

```bash
echo "$PW" | wallet-cli tx send --to TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub --amount 1000 --sign-only --permission-id 2 --expiration 86400000 --network tron:nile --password-stdin > tx.hex
```

A second signer appends their signature — no preview, no confirmation; the receipt carries the transaction content and progress blocks:

```bash
echo "$PW" | wallet-cli tx sign --file tx.hex --account cosigner --out tx.signed.hex --network tron:nile --password-stdin
```

```console
✅ Signature added
  Signer   TXe4Kd8nP2rF9gH5jL3mV6cW1bN7yS0aQz  (weight 1)
  Hex      written to tx.signed.hex

Transaction
  TxID        9c1...
  Type        Transfer TRX — 1,000 TRX
  From        TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw
  To          TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub
  Permission  active "finance" (id 2)  threshold 2
  Expires     2026-07-14 15:32 (~23h)

Progress  2 / 2 — threshold reached
| Approved signer                    | Weight |
| ---------------------------------- | ------ |
| TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw  |      1 |
| TXe4Kd8nP2rF9gH5jL3mV6cW1bN7yS0aQz  |      1 |

! Broadcast it: wallet-cli tx broadcast --file tx.signed.hex
```

With `--offline` the group name, threshold and per-signer weights are unavailable, so the receipt degrades to locally derivable fields and says so. `Signatures` is a **count**, not accumulated weight:

```bash
echo "$PW" | wallet-cli tx sign --file tx.hex --account cosigner --offline --network tron:nile --password-stdin
```

```console
✅ Signature added
  Signer  TXe4Kd8nP2rF9gH5jL3mV6cW1bN7yS0aQz
  Hex     0a02...9f31

Transaction (local inspection)
  TxID        9c1...
  Type        Transfer TRX — 1,000 TRX
  From        TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw
  To          TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub
  Permission  active (id 2)
  Signatures  1
  Expires     2026-07-14 15:32 (~23h)

! Approval state was not checked online. Inspect it with: wallet-cli tx approvals --hex <hex-above>
```

```bash
echo "$PW" | wallet-cli tx sign --file tx.hex --account cosigner --out tx.signed.hex --network tron:nile --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"tx.sign","data":{"kind":"tx-sign","signer":"TXe4Kd8nP2rF9gH5jL3mV6cW1bN7yS0aQz","hex":"0a02...9f31","checked":true,"transaction":{"txId":"9c1...","contractType":"TransferContract","operation":"Transfer TRX","from":"TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw","to":"TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub","rawAmount":"1000000000","permissionId":2,"expiration":1784388720000,"expired":false,"signatures":2},"signerWeight":1,"approval":{"txId":"9c1...","contractType":"TransferContract","operation":"Transfer TRX","from":"TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw","to":"TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub","rawAmount":"1000000000","permission":{"id":2,"name":"finance","threshold":2},"currentWeight":2,"missingWeight":0,"thresholdReached":true,"approved":[{"address":"TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw","weight":1},{"address":"TXe4Kd8nP2rF9gH5jL3mV6cW1bN7yS0aQz","weight":1}],"expiration":1784388720000,"expired":false,"signatures":2}},"meta":{"durationMs":310,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

The two input modes return different shapes.

`--hex` / `--file` (artifact signing):

| Field | Type | Meaning |
|---|---|---|
| `kind` | string | `"tx-sign"` |
| `signer` | string | The address that just signed |
| `hex` | string | The transaction hex with the new signature appended |
| `checked` | boolean | Whether the online permission/approval verification ran — `false` under `--offline` |
| `transaction` | object | Locally decoded summary: `txId`, `contractType`, `operation`, `from`, `to`, `rawAmount`, `permissionId` (a scalar — no group name or threshold), `expiration`, `expired`, `signatures` (count) |
| `signerWeight` | number | The signer's weight in the group. TRON, and only when `checked` is `true` |
| `approval` | object | Authoritative online approval state, same shape as [`tx approvals`](approvals.md) `data`. TRON, and only when `checked` is `true` |

On EVM the result is the single-signature shape instead — `kind: "sign"`, `mode: "sign-only"`, `signed` (`{raw, hash}`), `hex`, `address`, `txId` — the same shape `tx send --sign-only` emits, since one signature completes the transaction.

`transaction` is always present and identical in both modes, so a consumer can read it unconditionally; test `checked` before reaching for `approval`.

`--transaction` (direct JSON signing) returns the same shape `tx send --sign-only` emits, so consumers need no branch:

| Field | Type | Meaning |
|---|---|---|
| `kind` | string | `"sign"` |
| `mode` | string | `"sign-only"` |
| `address` | string | Address that produced the signature |
| `txId` | string | Transaction id |
| `signed` | object | The signed transaction — exactly what [`tx broadcast`](broadcast.md) accepts. A TRON transaction object here; `{raw, hash}` on EVM |

No `fee` is reported for `--transaction`: nothing was estimated, because the transaction was not built here.

## Exit status

`0` success · `1` execution failure (`tx_integrity` — the three TRON payload representations disagree, `invalid_transaction` — unusable payload, or on EVM a transaction that is already signed, `chain_id_mismatch` — the EVM transaction was built for another chain, `tx_expired`, `not_authorized` — this account isn't in the group's key list, `already_signed`, `watch_only_no_signer`, `auth_failed`, `signing_rejected`, `rpc_error`) · `2` usage error (`invalid_value`, `missing_option`).

## See also

[`tx approvals`](approvals.md) · [`tx broadcast`](broadcast.md) · [`tx multisig`](multisig.md) · [`permission show`](../permission/show.md)
