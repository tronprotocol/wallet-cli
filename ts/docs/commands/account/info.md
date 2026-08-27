# wallet-cli account info

Show the account's on-chain state.

## Synopsis

```
wallet-cli account info [options]
```

## Description

Returns what the chain knows about the address. The **field set** — not just the values — depends on the selected network's family:

- **TRON** — the node's full account object (balances, permissions, stakes) plus a normalized `resources` summary of bandwidth and energy. This is where you check whether an account has the resources to transact without burning TRX.
- **EVM** — the balance, the transaction `nonce`, and whether the address holds code (`type`: `eoa` or `contract`). There is no resource model to report.

## Options

Only the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli account info --network tron:nile
```

```console
Label        demo
Address      TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB
Balance      9,915.80311 TRX
Energy       used 0 / 0
Bandwidth    used 325 / 600
Created      2025-07-30
Permissions  owner 1-of-2, 1 active group
```

```bash
wallet-cli account info --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"account.info","data":{"address":"TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB","account":{"account_name":"71612d74657374","balance":"9915803110","create_time":1753860222000,"owner_permission":{…},"active_permission":[…],"frozenV2":[{},{"type":"ENERGY"},{"type":"TRON_POWER"}],…},"resources":{"bandwidth":{"used":325,"limit":600},"energy":{"used":0,"limit":0}}},"meta":{"durationMs":746,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

On an EVM network the same command reports the EVM account state:

```bash
wallet-cli account info --network evm:11155111
```

```console
Label    test1
Address  0x541B10b92b45C08513e67bb8209f035D810212B6
Balance  0 ETH
Nonce    0
Type     EOA
```

```bash
wallet-cli account info --network evm:11155111 -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"account.info","data":{"address":"0x541B10b92b45C08513e67bb8209f035D810212B6","balance":"0","nonce":0,"decimals":18,"symbol":"ETH","type":"eoa"},"meta":{"durationMs":402,"warnings":[]},"chain":{"family":"evm","network":"evm:11155111","chainId":"11155111"}}
```

## Output

`address` is always present; the rest of `data` is family-specific.

TRON:

| Field | Type | Meaning |
|---|---|---|
| `address` | string | Queried base58 address |
| `account` | object | Account object returned as-is by the TRON node: `balance` (SUN string), timestamps, `owner_permission` / `active_permission` (multi-sig keys & thresholds), `frozenV2` (staked amounts by type), etc.; fields are determined by the node, wallet-cli does not reshape them |
| `resources.bandwidth` | object | `used` / `limit` (bytes) |
| `resources.energy` | object | `used` / `limit` |

The `resources` block is normalized by wallet-cli — stable, safe to program against; `account` is returned as-is by the node, its fields vary with the node/protocol and are not guaranteed stable.

EVM:

| Field | Type | Meaning |
|---|---|---|
| `address` | string | Queried `0x` address, EIP-55 checksummed |
| `balance` | string | Native balance in wei |
| `nonce` | number | Number of transactions sent from this address; the next transaction's nonce |
| `decimals` | number | `18` |
| `symbol` | string | The network's native coin — `ETH`, `BNB` |
| `type` | string | `eoa` (no code) or `contract` (code deployed at this address) |

## Exit status

`0` · `1` execution failure · `2` usage error.

## See also

[`account balance`](balance.md) · `stake freeze` — obtain resources (TRON) · [Resource model](../../concepts/networks.md#fees-the-tron-resource-model)
