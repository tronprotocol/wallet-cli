# wallet-cli account info

Show the account's raw on-chain data plus a normalized bandwidth/energy resource summary.

## Synopsis

```
wallet-cli account info [options]
```

## Description

Returns the node's full account object — balances, permissions, stakes — plus a normalized `resources` summary of bandwidth and energy. This is where you check whether an account has the resources to transact without burning TRX.

## Options

Only the [global options](../index.md#global-options-every-command).

## Examples

```console
$ wallet-cli account info --network tron:nile
Label        main
Address      TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ
Balance      1969.421 TRX
Staked       12 TRX (energy 12 + bandwidth 0)
Energy       used 0 / 888
Bandwidth    used 374 / 600
Created      2026-06-30
Permissions  owner 1-of-1, 1 active group
```

```console
$ wallet-cli account info --network tron:nile -o json
{"schema":"wallet-cli.result.v1","success":true,"command":"tron.account.info","data":{"address":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","account":{"balance":"1976489000","create_time":1782787719000,"owner_permission":{…},"active_permission":[…],"frozenV2":[{},{"type":"ENERGY","amount":"12000000"},{"type":"TRON_POWER"}],…},"resources":{"bandwidth":{"used":0,"limit":600},"energy":{"used":0,"limit":888}}},"meta":{"durationMs":1914,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `address` | string | Queried base58 address |
| `account` | object | Account object returned as-is by the TRON node: `balance` (SUN string), timestamps, `owner_permission` / `active_permission` (multi-sig keys & thresholds), `frozenV2` (staked amounts by type), etc.; fields are determined by the node, wallet-cli does not reshape them |
| `resources.bandwidth` | object | `used` / `limit` (bytes) |
| `resources.energy` | object | `used` / `limit` |

The `resources` block is normalized by wallet-cli — stable, safe to program against; `account` is returned as-is by the node, its fields vary with the node/protocol and are not guaranteed stable.

## Exit status

`0` · `1` execution failure · `2` usage error.

## See also

[`account balance`](balance.md) · `stake freeze` — obtain resources · [Resource model](../../concepts/networks.md#fees-the-tron-resource-model)
