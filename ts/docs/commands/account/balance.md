# wallet-cli account balance

Show the native coin balance.

## Synopsis

```
wallet-cli account balance [options]
```

## Description

Fetches the native coin balance of the active account (or `--account`) from the node. Read-only; no unlock needed.

Which coin, and how much of it, follow the selected network: the balance is reported in the chain's base unit (SUN on TRON, wei on EVM), `decimals` comes from the chain family, and `symbol` comes from the network — `eip155:1` and `eip155:56` are one family with two coins, ETH and BNB.

## Options

Only the [global options](../index.md#global-options-every-command) (`--account`, `--network`, …).

## Examples

```bash
wallet-cli account balance --network nile
```

```console
Label    main
Balance  1,976.489 TRX
```

```bash
wallet-cli account balance --network nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"account.balance","data":{"address":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","balance":"1976489000","decimals":6,"symbol":"TRX"},"meta":{"durationMs":1114,"warnings":[]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

The same command on an EVM network reads that account's EVM address instead:

```bash
wallet-cli account balance --network sepolia -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"account.balance","data":{"address":"0x541B10b92b45C08513e67bb8209f035D810212B6","balance":"0","decimals":18,"symbol":"ETH"},"meta":{"durationMs":234,"warnings":[]},"chain":{"family":"evm","network":"eip155:11155111","chainId":"11155111"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `address` | string | Queried address, in the selected network's format (base58 on TRON, `0x` hex on EVM) |
| `balance` | string | Raw balance in the chain's base unit — SUN on TRON (`"1976489000"` = 1976.489 TRX), wei on EVM |
| `decimals` | number | Base units per coin: `6` on TRON, `18` on EVM |
| `symbol` | string | The network's native coin — `TRX`, `ETH`, `BNB` |

## Exit status

`0` · `1` execution failure (node unreachable, timeout) · `2` usage error.

## See also

[`account portfolio`](portfolio.md) — includes tokens · [`account info`](info.md) · [Fee models and units](../../concepts/networks.md#fees-the-tron-resource-model)
