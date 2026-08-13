# wallet-cli tx

Build, send, broadcast, and inspect transactions.

## Synopsis

```
wallet-cli tx COMMAND
```

## Subcommands

| Command | Description |
|---|---|
| [`tx send`](send.md) | Send native TRX or TRC20/TRC10 tokens with human `--amount` |
| [`tx sign`](sign.md) | Sign transaction JSON, or append a signature to transaction hex, offline |
| [`tx broadcast`](broadcast.md) | Validate and broadcast a presigned JSON or protobuf-hex transaction |
| [`tx approvals`](approvals.md) | Show permission, signature approvals, current weight, and expiration |
| [`tx multisig`](multisig.md) | Coordinate signature collection through the TronLink service |
| [`tx status`](status.md) | Show confirmation status of a transaction |
| [`tx info`](info.md) | Show full transaction detail + receipt |

## The transaction lifecycle

```
build ──sign──> submit ──solidify──> confirmed
  │                │                     │
  └ --dry-run      └ default return      └ tx status: confirmed/failed
    stops here       point ("submitted")   (pending/not_found while in flight)
```

`tx send` covers build+sign+submit in one step (with `--dry-run` / `--sign-only` stopping earlier); `tx broadcast` submits what was signed elsewhere; `tx status` / `tx info` observe the outcome. **Submission is not confirmation** — scripts must follow [machine-interface → Script safety](../../machine-interface.md#script-safety-never-mistake-submitted-for-confirmed).

## Multi-signature

When an account's [permission](../permission/index.md) threshold needs more weight than one key
carries, signing stops being a single step and becomes a collection process. Each permitted key
signs the *same* transaction in turn, and it can only be broadcast once the accumulated weight
reaches the threshold:

```
build ──> sign ──> sign ──> … ──> threshold reached ──> broadcast
 (--build-only)   each signer appends;        │
                  prior signatures preserved  └ tx approvals: who signed, how much weight is left
```

Two ways to move the transaction between signers:

| | How it travels | Command |
|---|---|---|
| **Offline / by hand** | A hex artifact you copy from signer to signer | [`tx sign --file … --out`](sign.md) |
| **Via the TronLink service** | A shared queue the service holds | [`tx multisig`](multisig.md) |

Either way, [`tx approvals`](approvals.md) answers "is it ready yet?", and
[`tx broadcast`](broadcast.md) refuses to submit a transaction that has not reached its threshold.

## See also

[`account history`](../account/index.md) · [Networks & fees](../../concepts/networks.md) · [Scripting guide](../../guide/scripting.md)
