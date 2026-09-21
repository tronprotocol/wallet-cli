# wallet-cli 8004 operator-check

Check whether an operator may manage all of an owner's Agents.

## Synopsis

```
wallet-cli 8004 operator-check <owner> <operator> [options]
```

## Description

Reads the registry's owner-wide approval — the one [`8004 add-operator`](add-operator.md) grants and [`8004 remove-operator`](remove-operator.md) removes. It does not report a per-Agent approval from [`8004 approve`](approve.md); [`8004 show`](show.md) shows that one. No wallet or password is needed.

Both addresses must belong to the selected network's family.

Runs on networks with an ERC-8004 Identity Registry: `tron`, `nile`, `shasta`, `bsc`, `bsc-testnet`, `base`, `base-sepolia`. See [`8004`](index.md).

## Arguments

- `owner` — address that owns the Agents
- `operator` — address to check

## Options

No command-specific options; the [global options](../index.md#global-options-every-command) only.

## Examples

Check whether `TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH` may manage all of `TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ`'s Agents:

```bash
wallet-cli 8004 operator-check TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH --network nile
```

```console
Owner                    TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ
Operator                 TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH
Approved for all Agents  No
Registry                 TDDk4vc69nzBCbsY4kfu7gw2jmvbinirj5
```

```bash
wallet-cli 8004 operator-check TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH --network nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"8004.operator-check","data":{"owner":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","operator":"TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH","approved":false,"registry":"TDDk4vc69nzBCbsY4kfu7gw2jmvbinirj5"},"meta":{"durationMs":1314,"warnings":[]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

`Approved for all Agents No` (JSON `approved: false`) means this operator may not manage the owner's Agents; after [`8004 add-operator`](add-operator.md) it would show `Yes` (`true`).

## Output

| Field | Type | Meaning |
|---|---|---|
| `owner` | string | The owner address checked |
| `operator` | string | The operator address checked |
| `approved` | boolean | Whether `operator` may manage all of `owner`'s Agents |
| `registry` | string | Identity Registry contract address |

## Exit status

`0` success · `1` execution failure (`rpc_error`, `timeout`) · `2` usage error (`family_mismatch` — an address of the other family; `unsupported_network_capability` — no registry on the selected network).

## See also

[`8004 add-operator`](add-operator.md) · [`8004 remove-operator`](remove-operator.md) · [`8004 show`](show.md)
