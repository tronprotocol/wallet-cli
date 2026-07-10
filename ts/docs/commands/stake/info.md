# wallet-cli stake info

Staking & resource overview.

## Synopsis

```
wallet-cli stake info [options]
```

## Description

One read-only screen of the account's staking state: staked amounts, voting power (TP), energy/bandwidth usage, pending unstakes, currently withdrawable TRX, and remaining unfreeze slots. The "look before you leap" for [`stake unfreeze`](unfreeze.md) / [`stake withdraw`](withdraw.md) / [`vote cast`](../vote/cast.md).

Reading the fields:

- **Staked** — the parenthesis splits the staked TRX by resource direction (TRX staked toward energy vs. bandwidth) — *not* the resource units obtained. The actual allowances are the `Energy` / `Bandwidth` limits (dynamic, network-wide conversion).
- **Voting power** — same source as [`vote status`](../vote/status.md): 1 TP = 1 staked TRX. Shown here to bridge stake → vote.
- **Unfreezing** — Stake 2.0 allows max **32 concurrent pending unstakes**; `N more allowed` is the chain's remaining count. When full, withdraw expired entries before unstaking more.
- **Withdrawable** — what [`stake withdraw`](withdraw.md) would claim right now.

## Options

No command-specific options; the [global options](../index.md#global-options-every-command) only (`--network` / `--account`).

## Examples

```console
$ wallet-cli stake info --account main --network tron:nile
Label            main
Staked           1,500 TRX  (for energy 1,000 TRX + for bandwidth 500 TRX)
Voting power     1,500 TP  (used 1,000 / available 500)
Energy           used 12,000 / 65,000
Bandwidth        used 600 / 1,500
Unfreezing       2 pending  (max 32 at a time, 30 more allowed)
  1) 500 TRX     withdrawable 2026-07-15  (in ~10 days)
  2) 300 TRX     withdrawable 2026-07-16  (in ~11 days)
Withdrawable     0 TRX now
```

```console
$ wallet-cli stake info --account main --network tron:nile -o json
{"schema":"wallet-cli.result.v1","success":true,"command":"tron.stake.info","data":{"address":"TQk...","staked":{"energySun":"1000000000","bandwidthSun":"500000000"},"votingPower":{"total":1500,"used":1000,"available":500},"resource":{"energy":{"used":12000,"limit":65000},"bandwidth":{"used":600,"limit":1500}},"unfreezing":[{"amountSun":"500000000","withdrawableAt":1784073600000},{"amountSun":"300000000","withdrawableAt":1784160000000}],"withdrawableSun":"0","unfreeze":{"used":2,"max":32,"remaining":30}},"meta":{"durationMs":22,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `address` | string | Queried account |
| `staked.energySun` / `.bandwidthSun` | string | Staked TRX by direction, in SUN (not resource units) |
| `votingPower.total` / `.used` / `.available` | number | TP total / spent / spendable |
| `resource.energy` / `.bandwidth` | object | `{used, limit}` in resource units |
| `unfreezing[]` | array | Pending unstakes: `{amountSun, withdrawableAt (epoch ms)}` |
| `withdrawableSun` | string | Currently withdrawable TRX, in SUN |
| `unfreeze` | object | Slot usage `{used, max, remaining}` |

## Exit status

`0` success · `1` execution failure (`rpc_error`) · `2` usage error (`invalid_value`).

## See also

[`stake delegated`](delegated.md) · [`vote status`](../vote/status.md) · [Staking guide](../../guide/stake-and-resources.md)
