# wallet-cli tx

Build, send, broadcast, co-sign, and inspect transactions.

## Synopsis

```
wallet-cli tx COMMAND
```

## Subcommands

| Command | Description | Networks |
|---|---|---|
| [`tx send`](send.md) | Send the native coin or a token with human `--amount` | TRON, EVM |
| [`tx broadcast`](broadcast.md) | Broadcast a presigned transaction | TRON, EVM |
| [`tx status`](status.md) | Show confirmation status of a transaction | TRON, EVM |
| [`tx info`](info.md) | Show full transaction detail + receipt | TRON, EVM |
| [`tx sign`](sign.md) | Sign a transaction built elsewhere | TRON, EVM |
| [`tx approvals`](approvals.md) | Show collected signatures on a multi-sig transaction | TRON only |
| [`tx multisig`](multisig.md) | Multi-sig collaboration via the TronLink service (list / create / co-sign / watch) | TRON only |

The transaction **hex** these commands exchange is `protocol.Transaction` protobuf on TRON and RLP (`0x02…`) on EVM. Fee flags differ by family too — `--fee-limit` / `--permission-id` / `--expiration` on TRON, `--gas-limit` / `--max-fee` / `--priority-fee` / `--nonce` on EVM — and each set is refused on the other family with `invalid_option`.

## The transaction lifecycle

```
build ──sign──> submit ──solidify──> confirmed
  │                │                     │
  └ --dry-run      └ default return      └ tx status: confirmed/failed
    stops here       point ("submitted")   (pending/not_found while in flight)
```

`tx send` covers build+sign+submit in one step (with `--dry-run` / `--sign-only` stopping earlier); `tx broadcast` submits what was signed elsewhere; `tx status` / `tx info` observe the outcome. **Submission is not confirmation** — scripts must follow [machine-interface → Script safety](../../machine-interface.md#script-safety-never-mistake-submitted-for-confirmed).

## Multi-sig co-signing

**TRON only.** An EVM transaction carries exactly one signature, so there is no threshold to reach and no co-signing path; `tx sign` there simply signs, and `tx approvals` / `tx multisig` are not bound to EVM at all.

For TRON accounts that require more than one signature, there are two co-signing paths:

- **On-chain** — [`tx sign`](sign.md) / [`tx approvals`](approvals.md) / [`tx broadcast`](broadcast.md): the initiator produces a partially signed hex with `--sign-only`, each signer appends theirs with `tx sign` (passing the hex along), and once the threshold is reached anyone broadcasts it. Self-sufficient, no service needed.
- **Service** — [`tx multisig`](multisig.md): the TronLink multi-sig service holds the transaction, accumulates signatures, and pushes notifications. Opening a collection is the initiator's own first signature, and the service broadcasts once the threshold is met. Optional convenience layer; needs credentials.

Either way, [`tx approvals`](approvals.md) answers "is it ready yet?", and [`tx broadcast`](broadcast.md) refuses to submit a transaction that has not reached its threshold — an incomplete collection never reaches the node.

See [`permission`](../permission/index.md) for the account permission structure that co-signing is built on.

## See also

[`account history`](../account/index.md) · [Networks & fees](../../concepts/networks.md) · [Scripting guide](../../guide/scripting.md)
