# wallet-cli chain prices

Show energy/bandwidth unit price and the memo fee.

## Synopsis

```
wallet-cli chain prices [options]
```

## Description

Shows the current energy unit price, bandwidth unit price, and memo fee — the inputs to "will this burn TRX, and how much". Read-only; no account or password.

The node returns a price *history* timeline; text shows only the current value (the last segment), while `-o json` keeps the full `history`.

**Units**: unit prices stay in **SUN** (1 TRX = 1,000,000 SUN) — the industry convention, and `--fee-limit` etc. are SUN-denominated; the memo fee, being an ordinary amount, is shown in TRX. json is uniformly SUN.

## Options

No command-specific options; the [global options](../index.md#global-options-every-command) only (`--network`).

## Examples

```bash
wallet-cli chain prices --network tron:nile
```

```console
Energy price      210 SUN / unit    (current)
Bandwidth price   1,000 SUN / unit  (current)
Memo fee          1 TRX
```

```bash
wallet-cli chain prices --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"chain.prices","data":{"energy":{"currentSunPerUnit":210,"history":[{"since":1542607200000,"price":100},{"since":1670515200000,"price":210}]},"bandwidth":{"currentSunPerUnit":1000,"history":[{"since":1542607200000,"price":10},{"since":1614456000000,"price":1000}]},"memoFeeSun":"1000000"},"meta":{"durationMs":21,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `energy.currentSunPerUnit` | number | Current energy price, SUN per unit |
| `energy.history[]` | array | `{since (epoch ms), price}` price timeline |
| `bandwidth.currentSunPerUnit` | number | Current bandwidth price, SUN per unit |
| `bandwidth.history[]` | array | `{since, price}` price timeline |
| `memoFeeSun` | string | Memo fee, in SUN |

## Exit status

`0` success · `1` execution failure (`rpc_error`, `timeout`) · `2` usage error.

## See also

[`chain params`](params.md) · [`chain node`](node.md) · [Energy & bandwidth](../../concepts/energy-bandwidth.md) · [`tx send`](../tx/send.md)
