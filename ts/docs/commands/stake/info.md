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

```bash
wallet-cli stake info --account main --network tron:nile
```

```console
Label         demo
Staked        0 TRX  (for energy 0 TRX + for bandwidth 0 TRX)
Voting power  14 TP  (used 1 / available 13)
Energy        used 0 / 0
Bandwidth     used 317 / 600
Unfreezing    4 pending  (max 32 at a time, 32 more allowed)
              ├─ 100 TRX        withdrawable 2026-08-11 18:26 (~16 day(s) ago)
              ├─ 1,800,151 TRX  withdrawable 2026-08-11 18:44 (~16 day(s) ago)
              ├─ 176 TRX        withdrawable 2026-08-11 18:45 (~16 day(s) ago)
              └─ 13 TRX         withdrawable 2026-08-11 18:45 (~16 day(s) ago)
Withdrawable  1,800,440 TRX now
```

Pending unstakes are listed as a tree under `Unfreezing`, each with the time it becomes withdrawable and how far away that is. An entry whose time has passed is already counted in `Withdrawable`; claim them all with [`stake withdraw`](withdraw.md).

```bash
wallet-cli stake info --account main --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"stake.info","data":{"address":"TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB","staked":{"energySun":"0","bandwidthSun":"0"},"votingPower":{"total":14,"used":1,"available":13},"resource":{"energy":{"used":0,"limit":0},"bandwidth":{"used":317,"limit":600}},"unfreezing":[{"amountSun":"100000000","withdrawableAt":1786444011000},{"amountSun":"1800151000000","withdrawableAt":1786445097000},{"amountSun":"176000000","withdrawableAt":1786445103000},{"amountSun":"13000000","withdrawableAt":1786445148000}],"withdrawableSun":"1800440000000","unfreeze":{"used":4,"max":32,"remaining":32}},"meta":{"durationMs":728,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
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
