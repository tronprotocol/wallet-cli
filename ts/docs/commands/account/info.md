# wallet-cli account info

Show raw account data (getAccount; TRON includes resources).

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
$ wallet-cli account info --network tron:nile -o json
{"schema":"wallet-cli.result.v1","success":true,"command":"tron.account.info","data":{"address":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","account":{"balance":"1976489000","create_time":1782787719000,"owner_permission":{…},"active_permission":[…],"frozenV2":[{},{"type":"ENERGY","amount":"12000000"},{"type":"TRON_POWER"}],…},"resources":{"bandwidth":{"used":0,"limit":600},"energy":{"used":0,"limit":888}}},"meta":{"durationMs":1914,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `address` | string | Queried base58 address |
| `account` | object | Raw node account: `balance` (SUN string), timestamps, `owner_permission` / `active_permission` (multi-sig keys & thresholds), `frozenV2` (staked amounts by type) — shape follows the node model |
| `resources.bandwidth` | object | `used` / `limit` (bytes) |
| `resources.energy` | object | `used` / `limit` |

The normalized `resources` block is the stable part; the raw `account` object mirrors the node.

## Exit status

`0` · `1` execution failure · `2` usage error.

## See also

[`account balance`](balance.md) · `stake freeze` — obtain resources · [Resource model](../../concepts/networks.md#fees-the-tron-resource-model)
