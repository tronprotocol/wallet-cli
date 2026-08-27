# wallet-cli tx info

Show full transaction detail + receipt.

## Synopsis

```
wallet-cli tx info --txid <id> [options]
```

## Description

Fetches the complete transaction object and its execution receipt, on TRON and EVM networks alike. Use this for forensics and fee analysis; for a simple "did it land?" check, [`tx status`](status.md) is cheaper — its four state values are stable, so you can program against them.

The top-level summary is normalized across families; the nested raw objects are not. On TRON they are `transaction` (the node's tx object) and `info` (its execution receipt); on EVM they are `transaction` (the `eth_getTransactionByHash` result) and `receipt` (the `eth_getTransactionReceipt` result, with its decoded fields alongside a `raw` copy).

Note the failure-mode difference: where `tx status` answers `not_found` with exit 0, `tx info` on an unknown txid is a plain **error** with exit 1 — there is no detail to show. The code is `rpc_error` on TRON (the node's own refusal) and `not_found` on EVM (see the examples below).

## Options

| Option | Description |
|---|---|
| `--txid <string>` | **Required.** Transaction id/hash — bare hex on TRON, `0x…` on EVM |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli tx info --txid 52332505ab6b605aff626aaef2b07f3718d4bac8f45cdab1c0ea9465eb98e065 --network tron:nile
```

```console
TxID           34d9da372cd7fa9d4e7384744c0925af9d682eef4c9410fb831e0b87b355171b
From           TR66PwBkGtktmiRhGjP9C6o8ts2ndDo4sP
To             TVMV1gstFzkDyBfrpNc1Sa72Az2dMgDCLY
Amount         1 TRX
Status         success
Block          #70,433,563
Confirmations  2
Fee            2.1 TRX
```

`-o json` returns the full detail (`transaction` is the raw tx, `info` is the receipt; elided as `{…}` here):

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"tx.info","data":{"txid":"34d9da372cd7fa9d4e7384744c0925af9d682eef4c9410fb831e0b87b355171b","from":"TR66PwBkGtktmiRhGjP9C6o8ts2ndDo4sP","to":"TVMV1gstFzkDyBfrpNc1Sa72Az2dMgDCLY","amount":"1","symbol":"TRX","status":"success","blockNumber":70433563,"confirmations":5,"feeSun":2100000,"transaction":{…},"info":{…}},"meta":{"durationMs":1396,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

On an EVM network the summary adds `type` and `nonce`, prices the fee in wei, and nests `receipt` instead of `info`:

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"tx.info","data":{"txid":"0x55b0068ef31bce39bbf5b06d456eaef307fd77f96d85ea291f48c1ae4b900d80","type":"contract-call","from":"0x88878d9250e68C574912f5618ad3b43f675B8888","nonce":342,"to":"0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E","rawAmount":"0","amount":"0","symbol":"ETH","blockTime":1787817996,"status":"success","blockNumber":11576586,"gasUsed":"127165","feeWei":"635825000000000","effectiveGasPriceWei":"5000000000","confirmations":0,"transaction":{…},"receipt":{…}},"meta":{"durationMs":706,"warnings":[]},"chain":{"family":"evm","network":"evm:11155111","chainId":"11155111"}}
```

An unknown txid errors out (exit 1) — unlike `tx status`'s `not_found` (exit 0):

```json
{"schema":"wallet-cli.result.v1","success":false,"command":"tx.info","error":{"code":"rpc_error","message":"TRON getTransaction failed: Transaction not found"},"meta":{"durationMs":1033,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

```json
{"schema":"wallet-cli.result.v1","success":false,"command":"tx.info","error":{"code":"not_found","message":"no transaction with hash 0x0000…0000 on evm:11155111"},"meta":{"durationMs":412,"warnings":[]},"chain":{"family":"evm","network":"evm:11155111","chainId":"11155111"}}
```

## Output

`data` is structured transaction detail: a normalized summary at the top level, plus the chain's own raw objects nested underneath. Only the summary is guaranteed stable — the nested objects follow the node's model and may vary with it. See [machine-interface](../../machine-interface.md).

Shared summary:

| Field | Type | Meaning |
|---|---|---|
| `txid` | string | Transaction id |
| `from` | string | Sender address |
| `to` | string | Recipient address |
| `amount` | string | Transfer amount (human units) |
| `symbol` | string | Native coin or token symbol |
| `status` | string | `success` / `failed` |
| `blockNumber` | number | Block height |
| `confirmations` | number | Blocks on top of the including block |

TRON adds:

| Field | Type | Meaning |
|---|---|---|
| `feeSun` | number | Fee actually charged, in SUN |
| `transaction` | object | Raw TRON transaction object (`raw_data`, `signature`, `txID`, …) |
| `info` | object | Execution receipt (`receipt` resource usage, `contractResult`, `blockTimeStamp`, …) |

EVM adds:

| Field | Type | Meaning |
|---|---|---|
| `type` | string | `transfer` (native send or decoded ERC20 transfer), `contract-creation` (no `to`), or `contract-call` |
| `nonce` | number | The sender's nonce for this transaction |
| `rawAmount` | string | Transferred value in wei |
| `blockTime` | number | Block timestamp, epoch seconds; best-effort — omitted if the block could not be read |
| `gasUsed` | string | Gas actually consumed |
| `feeWei` | string | Fee actually charged, in wei |
| `effectiveGasPriceWei` | string | Price per gas actually paid |
| `transaction` | object | `eth_getTransactionByHash` result, as returned |
| `receipt` | object | Decoded receipt (`success`, `gasUsed`, `feeWei`, `effectiveGasPriceWei`, `blockNumber`) with the node's own response under `raw` |

## Exit status

`0` found · `1` execution failure — including *not found* (`rpc_error` on TRON, `not_found` on EVM) · `2` usage error.

## See also

[`tx status`](status.md) · [`account history`](../account/history.md) · [Fees & resources](../../concepts/networks.md#fees-the-tron-resource-model)
