# wallet-cli 8004 remove-operator

Remove an operator's permission to manage all of this account's Agents.

## Synopsis

```
wallet-cli 8004 remove-operator <operator>
                  [--wait [--wait-timeout <ms>] | --sign-only | --build-only | --dry-run]
                  [--fee-limit <sun>] [--permission-id <n>] [--expiration <ms>] [options]
```

## Description

Calls the registry's `setApprovalForAll(operator, false)`, undoing [`8004 add-operator`](add-operator.md). Per-Agent approvals from [`8004 approve`](approve.md) are not affected — clear those with `8004 approve <id> --revoke`.

Requires an account. The master password (via `--password-stdin`) is needed only by the modes that sign.

Runs on networks with an ERC-8004 Identity Registry: `tron`, `nile`, `shasta`, `bsc`, `bsc-testnet`, `base`, `base-sepolia`. See [`8004`](index.md).

## Arguments

- `operator` — address to remove the permission from

## Options

| Option | Description |
|---|---|
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--sign-only` | Sign without broadcasting, output the signed hex; excludes `--dry-run` / `--build-only` |
| `--build-only` | Build and estimate, output the **unsigned** hex without unlocking the wallet; excludes `--dry-run` / `--sign-only` |
| `--dry-run` | Estimate only, no signature/broadcast; excludes `--sign-only` / `--build-only` |
| `--password-stdin` | Master password from stdin |

TRON only:

| Option | Description |
|---|---|
| `--fee-limit <sun>` | Max energy fee to burn, in SUN (default 100000000) |
| `--permission-id <n>` | Permission group to sign with (0=owner, 1=witness, 2-9=active); default `0` |
| `--expiration <ms>` | Transaction expiration in ms, up to `86400000` (24h); only with `--sign-only` or `--build-only`; omitted = node default (~60s) |

There are no EVM fee flags: on EVM the gas limit and fees come from the node's estimate, and `--gas-limit` and the like are refused as unknown options.

Plus the [global options](../index.md#global-options-every-command).

## Examples

Remove `TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH` as an operator for all Agents of the active account. `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`.

```bash
printf '%s' "$PW" | wallet-cli 8004 remove-operator TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH --network nile --wait --password-stdin
```

```console
✅ Called setApprovalForAll
  Contract  TDDk4vc69nzBCbsY4kfu7gw2jmvbinirj5
  Operator  TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH
  TxID      5f62b3cfba3da2859104add9ef36eb4bae4bc96f1480c67fd9c1eaf440e12c59
  Block     #71,039,810
  Energy    7,934
  Fee       1.1383 TRX
  Status    success
```

```bash
printf '%s' "$PW" | wallet-cli 8004 remove-operator TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH --network nile --wait --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"8004.remove-operator","data":{"kind":"contract-send","stage":"confirmed","txId":"9311d9aeec938ba6c640f45ebb699421037d687580c017892e22e96cfff5db0c","confirmed":true,"blockNumber":71039812,"feeSun":1138300,"energyUsed":7934,"energyFeeSun":793300,"netFeeSun":345000,"result":"SUCCESS","failed":false,"method":"setApprovalForAll(address,bool)","contract":"TDDk4vc69nzBCbsY4kfu7gw2jmvbinirj5","identity":{"operator":"TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH","requestedApproval":false,"approved":false}},"meta":{"durationMs":5058,"warnings":[]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

`Operator` (JSON `identity.operator`) is the address that lost the permission. `identity.approved: false` is the permission read back from the registry after confirmation; [`8004 operator-check`](operator-check.md) for this owner and operator returns the same.

## Output

`data` varies by stage:

| Mode | Fields |
|---|---|
| default (submit) | `kind: "contract-send"`, `stage: "submitted"`, `txId`, `method`, `contract`, `identity` |
| `--wait` (confirmed/failed) | above, but `stage: "confirmed"` or `"failed"`, plus `confirmed`, `blockNumber`, `failed`, and the realised cost — `feeSun` / `energyUsed` / `energyFeeSun` / `netFeeSun` / `result` on TRON, `gasUsed` / `feeWei` / `effectiveGasPriceWei` on EVM |
| `--sign-only` | `kind`, `mode: "sign-only"`, `hex`, `signed`, `address` (signer), `txId`, `fee`, `method`, `contract`, `identity` |
| `--build-only` | `kind`, `mode: "build-only"`, `hex` (**unsigned**), `tx`, `fee`, `method`, `contract`, `identity` |
| `--dry-run` | `kind`, `mode: "dry-run"`, `fee`, unsigned `tx`, `method`, `contract`, plus `nonce` on EVM, `identity` |

`identity` holds `operator` and `requestedApproval` (`false` for this command). After a confirmed `--wait`, it adds `approved` — the permission read back from the registry, which should equal `requestedApproval`. If that read fails, you get a warning instead; do not send the transaction again.

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`execution_reverted` — the registry refused the call during estimation, with the raw revert data in `error.details.revertData`; `auth_required` — a signing mode without `--password-stdin`; `watch_only_no_signer`, `auth_failed`, `rpc_error`, `timeout` — on timeout the tx may still be in flight; check [`tx status`](../tx/status.md)) · `2` usage error (`invalid_value` — a malformed id or URI, or a bad option combination such as `--expiration` without `--sign-only` / `--build-only`; `family_mismatch` — an address of the other chain family; `invalid_option` — `--wait` with an early-exit mode; `unsupported_network_capability` — no registry on the selected network)

## See also

[`8004 add-operator`](add-operator.md) · [`8004 operator-check`](operator-check.md)
