# wallet-cli chain params

Show on-chain governance parameters.

## Synopsis

```
wallet-cli chain params [--key <name>] [options]
```

## Description

> **TRON only.** SR-governed system parameters have no EVM counterpart; on an EVM network this fails with `family_mismatch` before any node call.

Lists the chain's governance parameters — network-wide system settings changed by SR proposals (see [`proposal create`](../proposal/create.md)); this command only reads them. `--key` returns a single one. Keys pass through exactly as the chain returns them; each parameter carries its `unit` from wallet-cli's parameter catalog (empty when it has none); text output adds thousands separators and that unit, `-o json` keeps raw values.

Frequently used keys:

| Key | Meaning |
|---|---|
| `getEnergyFee` | Energy unit price (sun/energy) — the burn rate when you lack energy; core input to fee estimation |
| `getTransactionFee` | Bandwidth unit price (sun/byte) — the burn rate once free bandwidth is spent |
| `getCreateAccountFee` | Burned (sun) when creating an account and the payer lacks enough staked bandwidth for the transaction — otherwise staked bandwidth is used instead |
| `getWitnessPayPerBlock` | SR reward per block produced (sun) — feeds the voting-reward pool |
| `getMaintenanceTimeInterval` | Maintenance cycle length (ms; 21,600,000 = 6 h on mainnet) — the vote-tally / SR-ranking period |

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
Value  100 sun
```

All parameters (excerpt):

```bash
wallet-cli chain params --network nile
```

```console
| Key                        | Value          |
| -------------------------- | -------------- |
| getEnergyFee               | 100 sun        |
| getTransactionFee          | 1,000 sun/byte |
| getCreateAccountFee        | 100,000 sun    |
| getWitnessPayPerBlock      | 8,000,000 sun  |
| getMaintenanceTimeInterval | 1,800,000 ms   |
```

```bash
wallet-cli chain params --network nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"chain.params","data":{"params":[{"key":"getEnergyFee","value":100,"unit":"sun"},{"key":"getTransactionFee","value":1000,"unit":"sun/byte"},{"key":"getCreateAccountFee","value":100000,"unit":"sun"}]},"meta":{"durationMs":19,"warnings":[]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

## Output

`data.params[]` — one entry per parameter:

| Field | Type | Meaning |
|---|---|---|
| `key` | string | Parameter name, verbatim from the chain |
| `value` | number | Raw chain value, no unit suffix. Absent altogether for a parameter the node reports without one |
| `unit` | string | Unit of `value` (`sun`, `sun/byte`, `ms`); empty for a flag, a count, or a key wallet-cli does not know |

With `--key`, `data` is that one entry — `key`, `value`, `unit` — not a `params` array.

A parameter value that cannot be represented as a safe integer fails with `provider_error`.

## Exit status

`0` success · `1` execution failure (`rpc_error`) · `2` usage error (`unknown_parameter` — `--key` doesn't exist; `invalid_value`; `family_mismatch` on an EVM network).

## See also

[`chain prices`](prices.md) · [`chain node`](node.md)
