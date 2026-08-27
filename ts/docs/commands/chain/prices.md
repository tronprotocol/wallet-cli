# wallet-cli chain prices

Show the current transaction unit prices.

## Synopsis

```
wallet-cli chain prices [options]
```

## Description

Shows what a transaction currently costs per unit — the inputs to "how much will this burn". Read-only; no account or password.

**The answer is shaped by the network's fee model, and the two are not comparable:**

- **TRON (`tron-resource`)** — the energy unit price, the bandwidth unit price, and the memo fee. The node returns each as a price *history* timeline; text shows only the current value (the last segment), while `-o json` keeps the full `history`.
- **EVM (`eip1559` / `legacy`)** — the current base fee, the suggested priority fee (tip), the resulting gas price, and what a plain 21,000-gas native transfer would cost at those numbers.

**Units**: TRON unit prices stay in **SUN** (1 TRX = 1,000,000 SUN) — the industry convention, and `--fee-limit` is SUN-denominated; the memo fee, being an ordinary amount, is shown in TRX. EVM prices are shown in **gwei** and costs in the native coin; json is uniformly the base unit (SUN, wei).

## Options

No command-specific options; the [global options](../index.md#global-options-every-command) only (`--network`).

## Examples

```bash
wallet-cli chain prices --network tron:nile
```

```console
Energy price     100 SUN / unit    (current)
Bandwidth price  1,000 SUN / unit  (current)
Memo fee         1 TRX
```

```bash
wallet-cli chain prices --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"chain.prices","data":{"energy":{"currentSunPerUnit":100,"history":[{"since":0,"price":100},{"since":1754644200000,"price":100}]},"bandwidth":{"currentSunPerUnit":1000,"history":[{"since":0,"price":10},{"since":1626253800000,"price":1000}]},"memoFeeSun":"1000000"},"meta":{"durationMs":687,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

On an EVM network the answer is a gas price instead:

```bash
wallet-cli chain prices --network evm:11155111
```

```console
Fee model      eip1559
Base fee       0.947033 gwei
Priority fee   0.001 gwei
Gas price      0.948033 gwei
Transfer cost  0.000019 ETH  (21,000 gas)
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"chain.prices","data":{"feeModel":"eip1559","baseFeeWei":"947033827","priorityFeeWei":"1000000","gasPriceWei":"948033827","transferGas":21000,"transferCostWei":"19908710367000"},"meta":{"durationMs":390,"warnings":[]},"chain":{"family":"evm","network":"evm:11155111","chainId":"11155111"}}
```

## Output

`data` has no shared fields between the families — read `chain.family` (or `feeModel`) first.

TRON:

| Field | Type | Meaning |
|---|---|---|
| `energy.currentSunPerUnit` | number | Current energy price, SUN per unit |
| `energy.history[]` | array | `{since (epoch ms), price}` price timeline |
| `bandwidth.currentSunPerUnit` | number | Current bandwidth price, SUN per unit |
| `bandwidth.history[]` | array | `{since, price}` price timeline |
| `memoFeeSun` | string | Memo fee, in SUN |

EVM:

| Field | Type | Meaning |
|---|---|---|
| `feeModel` | string | `eip1559` or `legacy` |
| `baseFeeWei` | string | The latest block's base fee per gas; EIP-1559 chains only |
| `priorityFeeWei` | string | The node's suggested tip per gas |
| `gasPriceWei` | string | Price per gas at those numbers |
| `transferGas` | number | `21000` — the gas a plain native transfer costs |
| `transferCostWei` | string | `transferGas × gasPriceWei`, i.e. what that transfer would cost now |

## Exit status

`0` success · `1` execution failure (`rpc_error`, `timeout`) · `2` usage error.

## See also

[`chain params`](params.md) · [`chain node`](node.md) · [Energy & bandwidth](../../concepts/energy-bandwidth.md) · [`tx send`](../tx/send.md)
