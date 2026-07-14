# wallet-cli stake delegated

Delegation details and max delegatable size.

## Synopsis

```
wallet-cli stake delegated [--direction out|in] [--resource energy|bandwidth]
                           [--to <address>] [options]
```

## Description

Read-only listing of resource delegations, in either direction: `out` (default — what you delegated to others, plus **Max delegatable**, how much you can still delegate) or `in` (what others delegated to you; no max — that concept only exists outbound). `--to` narrows to one counterparty (out only).

**The lock column flips meaning with the viewpoint.** Both directions read the same on-chain expiry field, but:

- **out** → `Locked until`: a lock *you* set — you cannot reclaim before it expires (`not locked` when reclaimable anytime);
- **in** → `Guaranteed until`: the delegator cannot reclaim before then — your guaranteed floor (`none — reclaimable anytime` warns the resource can vanish whenever the delegator wants it back).

json keeps the raw `lockedUntil` timestamp in both directions — no viewpoint translation at the machine layer.

## Options

| Option | Description |
|---|---|
| `--direction <out\|in>` | `out` = delegated to others (default); `in` = delegated to me |
| `--resource <energy\|bandwidth>` | Filter to a single resource type (default both) |
| `--to <string>` | Only the delegation to this receiver (out only) |

Plus the [global options](../index.md#global-options-every-command).

## Examples

Outbound (default) — includes **Max delegatable**:

```bash
wallet-cli stake delegated --direction out --account main --network tron:nile
```

```console
Label        main
Direction    out (delegated to others)

Max delegatable
  Energy       58,500  (≈ 900 TRX)
  Bandwidth       900  (≈ 300 TRX)

Delegations (2)
  Receiver                            Resource   Amount   Locked until
  TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub  energy     500 TRX  2026-07-08 08:00 (~3 days)
  TXe4Kd8nP2rF9gH5jL3mV6cW1bN7yS0aQz  bandwidth  100 TRX  not locked
```

```bash
wallet-cli stake delegated --direction out --account main --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"tron.stake.delegated","data":{"address":"TQk...","direction":"out","canDelegateMaxSun":{"energy":"900000000","bandwidth":"300000000"},"delegations":[{"receiver":"TBy6...","resource":"energy","amountSun":"500000000","lockedUntil":1783468800000},{"receiver":"TXe4...","resource":"bandwidth","amountSun":"100000000","lockedUntil":null}]},"meta":{"durationMs":28,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

Inbound (`--direction in`) — the lock column becomes `Guaranteed until`, no Max delegatable:

```bash
wallet-cli stake delegated --direction in --account main --network tron:nile
```

```console
Label        main
Direction    in (delegated to me)

Delegations (1)
  From                                Resource  Amount   Guaranteed until
  TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub  energy    500 TRX  2026-07-08 08:00 (~3 days)
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `address` | string | Queried account |
| `direction` | string | `out` / `in` |
| `canDelegateMaxSun` | object | `{energy, bandwidth}` SUN strings — max still delegatable (out only) |
| `delegations[]` | array | Each: `receiver` (out) or `from` (in), `resource`, `amountSun` (string), `lockedUntil` (epoch ms or `null`) |

## Exit status

`0` success · `1` execution failure (`rpc_error`) · `2` usage error (`invalid_value`).

## See also

[`stake delegate`](delegate.md) · [`stake undelegate`](undelegate.md) · [`stake info`](info.md)
