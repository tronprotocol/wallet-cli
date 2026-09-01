# wallet-cli permission show

Show the account's permission structure.

## Synopsis

```
wallet-cli permission show [options]
```

## Description

A read-only view of the account's permission groups — owner, witness (SRs only), and up to 8 active groups — each with its threshold, keys (address + weight), and, for active groups, the decoded list of operations it may perform. Run it before `permission update`, and use it to check a co-signer's structure before signing.

By default it reads the active account; `--account` overrides it and also accepts a bare address, so you can inspect any account on chain.

Reading the output — the text layout mirrors the TronScan permission page, one "label / value" card per group:

- **Permission Name** — the on-chain `permission_name` plus its id (active groups are marked `active`). The name is chosen when the group is created by [`permission update`](update.md); it is a mnemonic only, with no on-chain meaning. A never-modified account shows the chain default: an `owner` and an `active` group, each with the account's own address as the sole key and threshold `1`.
- **Operation(s)** — active groups only. On chain this is a 32-byte bitmap (one bit per contract type); the text decodes it to human operation labels (`Transfer TRX`, `Vote`, …) and gives the total count. The label set matches what the TronScan permission page shows. JSON keeps the machine-readable contract-type names in `operations` plus the raw `operationsHex`.
- **Threshold** — the combined signature weight a transaction needs to be valid for this group.
- **Authorized To** — the group's keys as `Address / Weight`. Keys held by a local wallet (software or Ledger) are annotated `(this wallet: <label>)`, so you can see at a glance how much weight you control — the basis for the lockout warning in [`permission update`](update.md).

## Options

No command-specific options; the [global options](../index.md#global-options-every-command) only (`--network`, and `--account`, which also accepts a bare address).

## Examples

**A never-modified account** shows the chain-default owner and active groups. The active group's complete operation set is line-wrapped to fit the terminal; labels are never replaced with an ellipsis. Unknown bitmap bits are printed as `Unknown contract type <id>`.

**A multi-sig account** — here the owner group is a 2-of-3 and a scoped `finance` active group handles day-to-day transfers. This wallet holds only one of the keys (`main`); the other two are held by external co-signers, so they carry no annotation:

```bash
wallet-cli permission show --account main --network tron:3448148188
```

```console
Account  main (TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw)

Permission Name   owner  (id 0)
Threshold         2
Authorized To     Address                             Weight
                  TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw  1      (this wallet: main)
                  TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub  1
                  TXe4Kd8nP2rF9gH5jL3mV6cW1bN7yS0aQz  1

Permission Name   finance  (id 2, active)
Operation(s)      Transfer TRX · Transfer TRC10 · Trigger Smart Contract  (3 total)
Threshold         2
Authorized To     Address                             Weight
                  TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw  1      (this wallet: main)
                  TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub  1
                  TXe4Kd8nP2rF9gH5jL3mV6cW1bN7yS0aQz  1
```

```bash
wallet-cli permission show --account main --network tron:3448148188 -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"permission.show","data":{"address":"TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw","owner":{"id":0,"name":"owner","threshold":2,"keys":[{"address":"TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw","weight":1,"local":"main"},{"address":"TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub","weight":1,"local":null},{"address":"TXe4Kd8nP2rF9gH5jL3mV6cW1bN7yS0aQz","weight":1,"local":null}]},"witness":null,"actives":[{"id":2,"name":"finance","threshold":2,"operations":["TransferContract","TransferAssetContract","TriggerSmartContract"],"operationLabels":["Transfer TRX","Transfer TRC10","Trigger Smart Contract"],"operationsHex":"0600008000000000000000000000000000000000000000000000000000000000","unknownOperationIds":[],"keys":[{"address":"TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw","weight":1,"local":"main"},{"address":"TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub","weight":1,"local":null},{"address":"TXe4Kd8nP2rF9gH5jL3mV6cW1bN7yS0aQz","weight":1,"local":null}]}]},"meta":{"durationMs":21,"warnings":[]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `address` | string | Queried account |
| `owner` | object | Owner group `{id, name, threshold, keys[]}` |
| `witness` | object \| null | Witness group with `{id, name, threshold, keys[]}` for SRs, else `null` |
| `actives[]` | array | Active groups, each `{id, name, threshold, operations[], operationLabels[], operationsHex, unknownOperationIds[], keys[]}` |
| `…operations[]` | string[] | Contract-type names the active group may perform |
| `…operationLabels[]` | string[] | Human-readable labels corresponding to known operation ids |
| `…operationsHex` | string | Raw 32-byte operations bitmap, hex |
| `…unknownOperationIds[]` | number[] | Set bits this build cannot map to a known contract type; empty when all operations are known |
| `…keys[]` | array | Group keys: `{address, weight, local}` — `local` is the wallet label if held locally, else `null` |

## Exit status

`0` success · `1` execution failure (`not_found` — the address is unactivated / absent on chain; `rpc_error`) · `2` usage error (`invalid_value`).

## See also

[`permission update`](update.md) · [`tx sign`](../tx/sign.md) · [`tx approvals`](../tx/approvals.md) · [Security](../../concepts/security.md)
