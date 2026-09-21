# wallet-cli tx info

Show full transaction detail + receipt.

## Synopsis

```
wallet-cli tx info --txid <id> [options]
```

## Description

Fetches the complete transaction object and its execution receipt, on TRON and EVM networks alike. Use this for forensics and fee analysis; for a simple "did it land?" check, [`tx status`](status.md) is cheaper — its four state values are stable, so you can program against them.

The top-level summary is normalized across families; the nested raw objects are not. On TRON they are `transaction` (the node's tx object) and `info` (its execution receipt); on EVM they are `transaction` (the `eth_getTransactionByHash` result) and `receipt`.

Note the failure-mode difference: where `tx status` answers `not_found` with exit 0, `tx info` on an unknown txid is a plain **error** — there is no detail to show. The families differ in both code and exit code: TRON surfaces the node's own refusal as `rpc_error` at exit **1**, while EVM raises `not_found` at exit **2**, treating the lookup as a bad call since the hash addresses nothing. Branch on the exit code first, then on `error.code`.

## Options

| Option | Description |
|---|---|
| `--txid <string>` | **Required.** Transaction id/hash — bare hex on TRON, `0x…` on EVM |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli tx info --txid 52332505ab6b605aff626aaef2b07f3718d4bac8f45cdab1c0ea9465eb98e065 --network nile
```

```console
TxID    52332505ab6b605aff626aaef2b07f3718d4bac8f45cdab1c0ea9465eb98e065
From    TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ
To      TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH
Amount  1 TRX
Status  success
Block   #69,084,269
```

`-o json` returns the full detail (`transaction` is the raw tx, `info` is the receipt; shown as empty objects here):

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"tx.info","data":{"txid":"52332505ab6b605aff626aaef2b07f3718d4bac8f45cdab1c0ea9465eb98e065","from":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","to":"TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH","amount":"1","symbol":"TRX","status":"success","blockNumber":69084269,"transaction":{},"info":{}},"meta":{"durationMs":1396,"warnings":[]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

On an EVM network the summary adds `type` and `nonce`, prices the fee in wei, and nests `receipt` instead of `info`:

```bash
wallet-cli tx info --txid 0x55b0068ef31bce39bbf5b06d456eaef307fd77f96d85ea291f48c1ae4b900d80 --network sepolia -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"tx.info","data":{"txid":"0x55b0068ef31bce39bbf5b06d456eaef307fd77f96d85ea291f48c1ae4b900d80","type":"contract-call","from":"0x88878d9250e68C574912f5618ad3b43f675B8888","nonce":342,"to":"0x1b853EbA683A7C0b691256124392F3b922771869","status":"success","blockNumber":11576586,"confirmations":0,"gasUsed":"46231","feeWei":"43850186538","effectiveGasPriceWei":"948493","transaction":{},"receipt":{}},"meta":{"durationMs":455,"warnings":[]},"chain":{"family":"evm","network":"eip155:11155111","chainId":"11155111"}}
```

An unknown txid errors out — unlike `tx status`'s `not_found` (exit 0). The code and exit code differ by family (TRON `rpc_error`, exit 1; EVM `not_found`, exit 2):

```json
{"schema":"wallet-cli.result.v1","success":false,"command":"tx.info","error":{"code":"rpc_error","message":"TRON getTransaction failed: Transaction not found"},"meta":{"durationMs":1033,"warnings":[]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

```json
{"schema":"wallet-cli.result.v1","success":false,"command":"tx.info","error":{"code":"not_found","message":"no transaction with hash 0x0000…0000 on eip155:11155111"},"meta":{"durationMs":412,"warnings":[]},"chain":{"family":"evm","network":"eip155:11155111","chainId":"11155111"}}
```

## Output

`data` is structured transaction detail: a normalized summary at the top level, plus the chain's own raw objects nested underneath. Only the summary is guaranteed stable — the nested objects follow the node's model and may vary with it.

Shared summary:

| Field | Type | Meaning |
|---|---|---|
| `txid` | string | Transaction id |
| `from` | string | Sender address |
| `to` | string | Recipient address |
| `amount` | string | Transfer amount (human units) |
| `symbol` | string | Native coin or token symbol |
| `status` | string | Lower-cased, so match on `"success"` and never `"SUCCESS"`. On EVM it is `success` or `revert`; on TRON it is the node's own `contractRet` lower-cased — `success`, `revert`, `out_of_energy`, and so on. It is never `failed` |
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

`0` found · `1` execution failure — including *not found* on TRON (`rpc_error`) · `2` usage error, including *not found* on EVM (`not_found`).

## See also

[`tx status`](status.md) · [`account history`](../account/history.md) · [Fee models](../../concepts/networks.md#fees-the-tron-resource-model)
