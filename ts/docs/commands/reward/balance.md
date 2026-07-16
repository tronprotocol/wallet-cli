# wallet-cli reward balance

Show claimable reward and withdraw status.

## Synopsis

```
wallet-cli reward balance [options]
```

## Description

Shows the currently claimable voting/block reward and whether it can be withdrawn now. Read-only — the "check before you claim" companion to [`reward withdraw`](withdraw.md), so you never have to probe the 24-hour limit by triggering its `withdraw_too_frequent` error.

`Withdraw status` derives from the account's on-chain `latest_withdraw_time` + 24 h: past it (or never withdrawn) → `available now`; otherwise `available from <absolute time> (~relative)`.

## Options

No command-specific options; the [global options](../index.md#global-options-every-command) only (`--network` / `--account`).

## Examples

Claimable right now:

```bash
wallet-cli reward balance --account main --network tron:nile
```

```console
Label            main
Claimable        123.456789 TRX
Withdraw status  available now
```

Within 24 h of the last withdrawal:

```bash
wallet-cli reward balance --account main --network tron:nile
```

```console
Label            main
Claimable        5.678901 TRX
Withdraw status  available from 2026-07-06 09:30 (~18h)
```

```bash
wallet-cli reward balance --account main --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"reward.balance","data":{"address":"TQk...","rewardSun":"123456789","withdrawableNow":true,"withdrawableAt":null},"meta":{"durationMs":14,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `address` | string | Queried account |
| `rewardSun` | string | Claimable reward, in SUN |
| `withdrawableNow` | boolean | Whether it can be withdrawn now |
| `withdrawableAt` | number \| null | When it becomes withdrawable (epoch ms); `null` when already withdrawable |

## Exit status

`0` success · `1` execution failure (`rpc_error`) · `2` usage error (`invalid_value`).

## See also

[`reward withdraw`](withdraw.md) · [`vote status`](../vote/status.md)
