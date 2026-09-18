# wallet-cli chain params

Show on-chain governance parameters.

## Synopsis

```
wallet-cli chain params [--key <name>] [options]
```

## Description

> **TRON only.** SR-governed system parameters have no EVM counterpart; on an EVM network this fails with `family_mismatch` before any node call.

Lists the chain's governance parameters — network-wide system settings changed by SR proposals (see [`proposal create`](../proposal/create.md)); this command only reads them. `--key` returns a single one. Keys pass through exactly as the chain returns them; text output adds thousands separators and units (SUN / ms) for known numeric keys, `-o json` keeps raw values.

Frequently used keys:

| Key | Meaning |
|---|---|
| `getEnergyFee` | Energy unit price (SUN/energy) — the burn rate when you lack energy; core input to fee estimation |
| `getTransactionFee` | Bandwidth unit price (SUN/byte) — the burn rate once free bandwidth is spent |
| `getCreateAccountFee` | System-side account creation fee (SUN) — part of the extra cost of sending to a fresh address |
| `getWitnessPayPerBlock` | SR reward per block produced (SUN) — feeds the voting-reward pool |
| `getMaintenanceTimeInterval` | Maintenance cycle length (ms; 21,600,000 = 6 h) — the vote-tally / SR-ranking period |

For the fee-relevant prices in friendlier form, use [`chain prices`](prices.md).

## Options

| Option | Description |
|---|---|
| `--key <string>` | Return only this parameter (e.g. `getEnergyFee`) |

Plus the [global options](../index.md#global-options-every-command).

## Examples

A single parameter with `--key`:

```bash
wallet-cli chain params --key getEnergyFee --network nile
```

```console
Key    getEnergyFee
Value  210 SUN
```

All parameters (excerpt):

```bash
wallet-cli chain params --network nile
```

```console
| Key                        | Value          |
| -------------------------- | -------------- |
| getEnergyFee               | 210 SUN        |
| getTransactionFee          | 1,000 SUN      |
| getCreateAccountFee        | 100,000 SUN    |
| getWitnessPayPerBlock      | 16,000,000 SUN |
| getMaintenanceTimeInterval | 21,600,000 ms  |
```

```bash
wallet-cli chain params --network nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"chain.params","data":{"params":[{"key":"getEnergyFee","value":210},{"key":"getTransactionFee","value":1000},{"key":"getCreateAccountFee","value":100000}]},"meta":{"durationMs":19,"warnings":[]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

## Output

`data.params[]` — one entry per parameter:

| Field | Type | Meaning |
|---|---|---|
| `key` | string | Parameter name, verbatim from the chain |
| `value` | number | Raw chain value, no unit suffix (text adds SUN / ms). Absent altogether for a parameter the node reports without one |

## Exit status

`0` success · `1` execution failure (`rpc_error`) · `2` usage error (`not_found` — `--key` doesn't exist; `invalid_value`; `family_mismatch` on an EVM network).

## See also

[`chain prices`](prices.md) · [`chain node`](node.md)
