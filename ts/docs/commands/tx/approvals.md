# wallet-cli tx approvals

Show collected signatures on a multi-sig transaction. TRON only.

## Synopsis

```
wallet-cli tx approvals (--hex <hex> | --file <path>) [options]
```

## Description

A read-only view of a transaction hex's co-signing progress: the permission group and threshold it uses, the accumulated weight so far, the list of signers who have already approved, how much weight is still missing, and the expiration. It's the "look before you sign" companion to [`tx sign`](sign.md) — same information, no signature, no account or password needed.

TRON only — multi-signature approval is a TRON permission-model concept, so on an EVM network the command fails with `family_mismatch` before any node call.

It needs a node (`--network`), because approval state — which signatures count, and for how much weight — is the chain's answer, not something derivable from the artifact alone. Files are read with a size cap of just over 1 MiB and must be regular files, not symlinks.

An expired transaction is still queryable (no error): the text `Expires` line shows `expired <time>` with a `!` hint to re-initiate, and the JSON `expired` field is `true`.

## Options

| Option | Description |
|---|---|
| `--hex <hex>` | **Required** (one of). `protocol.Transaction` hex string |
| `--file <path>` | **Required** (one of). File containing the transaction hex |

Plus the [global options](../index.md#global-options-every-command) (`--network`).

## Examples

```bash
wallet-cli tx approvals --file tx.hex --network tron:nile
```

```console
Transaction
  TxID        9c1...
  Type        Transfer TRX — 1,000 TRX
  From        TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw
  To          TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub
  Permission  active "finance" (id 2)  threshold 2
  Expires     2026-07-14 15:32 (~22h)

Progress  1 / 2 — 1 more weight needed
  Approved signer                     Weight
  TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw  1
```

```bash
wallet-cli tx approvals --file tx.hex --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"tx.approvals","data":{"txId":"9c1...","contractType":"TransferContract","operation":"Transfer TRX","from":"TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw","to":"TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub","rawAmount":"1000000000","permission":{"id":2,"name":"finance","threshold":2},"currentWeight":1,"missingWeight":1,"thresholdReached":false,"approved":[{"address":"TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw","weight":1}],"expiration":1784388720000,"expired":false,"signatures":1},"meta":{"durationMs":45,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `txId` | string | Transaction id |
| `contractType` | string | Raw contract-type enum (e.g. `TransferContract`) |
| `from` / `to` | string | Sender / recipient |
| `rawAmount` | string | Raw integer amount; units follow the contract type (SUN for TRX, token base units for TRC20/TRC10) |
| `operation` | string | Human operation name, e.g. `Transfer TRX` |
| `signatures` | number | How many signatures the artifact currently carries |
| `permission` | object | The signing group: `{id, name, threshold}` |
| `currentWeight` / `missingWeight` | number | Accumulated weight so far / weight still needed |
| `thresholdReached` | boolean | Whether the threshold is met |
| `approved[]` | array | Signers who have approved: `{address, weight}` |
| `expiration` | number | Expiry (epoch ms) |
| `expired` | boolean | Whether it has already expired |

## Exit status

`0` success · `1` execution failure (`invalid_transaction`, `rpc_error`) · `2` usage error (`invalid_value`).

## See also

[`tx sign`](sign.md) · [`tx broadcast`](broadcast.md) · [`permission show`](../permission/show.md)
