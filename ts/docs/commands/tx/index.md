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
| [`tx broadcast`](broadcast.md) | Broadcast a presigned transaction |
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

## See also

[`account history`](../account/index.md) · [Networks & fees](../../concepts/networks.md) · [Scripting guide](../../guide/scripting.md)
