# wallet-cli 8004 add-operator

Let an operator manage every Agent this account owns.

## Synopsis

```
wallet-cli 8004 add-operator <operator>
                  [--wait [--wait-timeout <ms>] | --sign-only | --build-only | --dry-run]
                  [--fee-limit <sun>] [--permission-id <n>] [--expiration <ms>] [options]
```

## Description

Calls the registry's `setApprovalForAll(operator, true)` from the active account (or `--account`). The operator can then update, transfer, or approve an operator for any Agent the account owns, including Agents it receives later, until [`8004 remove-operator`](remove-operator.md) takes the permission away.

To approve an operator for a single Agent, use [`8004 approve`](approve.md). Check the result with [`8004 operator-check`](operator-check.md).

Requires an account. The master password (via `--password-stdin`) is needed only by the modes that sign.

Runs on networks with an ERC-8004 Identity Registry: `tron`, `nile`, `shasta`, `bsc`, `bsc-testnet`, `base`, `base-sepolia`. See [`8004`](index.md).

## Arguments

- `operator` — address to give the permission to

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

Let `TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH` manage every Agent of the active account. `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`.

```bash
printf '%s' "$PW" | wallet-cli 8004 add-operator TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH --network nile --wait --password-stdin
```

```console
✅ Called setApprovalForAll
  Contract  TDDk4vc69nzBCbsY4kfu7gw2jmvbinirj5
  Operator  TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH
  TxID      1275606774d2f7d51d9e534f919a16fa99d452d1545a43ac4a18792696cd8531
  Block     #71,039,806
  Energy    22,934
  Fee       2.1681 TRX
  Status    success
```

```bash
printf '%s' "$PW" | wallet-cli 8004 add-operator TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH --network nile --wait --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"8004.add-operator","data":{"kind":"contract-send","stage":"confirmed","txId":"0320dea652e7e0899d7b64fc2d1f02e642c902d37f5de1321f07edbf853deaea","confirmed":true,"blockNumber":71039808,"feeSun":1138300,"energyUsed":7934,"energyFeeSun":793300,"netFeeSun":345000,"result":"SUCCESS","failed":false,"method":"setApprovalForAll(address,bool)","contract":"TDDk4vc69nzBCbsY4kfu7gw2jmvbinirj5","identity":{"operator":"TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH","requestedApproval":true,"approved":true}},"meta":{"durationMs":6158,"warnings":[]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

`Operator` (JSON `identity.operator`) is the address that received the permission. `identity.approved: true` is the permission read back from the registry after confirmation, so a separate [`8004 operator-check`](operator-check.md) is not needed.

## Output

`data` varies by stage:

| Mode | Fields |
|---|---|
| default (submit) | `kind: "contract-send"`, `stage: "submitted"`, `txId`, `method`, `contract`, `identity` |
| `--wait` (confirmed/failed) | above, but `stage: "confirmed"` or `"failed"`, plus `confirmed`, `blockNumber`, `failed`, and the realised cost — `feeSun` / `energyUsed` / `energyFeeSun` / `netFeeSun` / `result` on TRON, `gasUsed` / `feeWei` / `effectiveGasPriceWei` on EVM |
| `--sign-only` | `kind`, `mode: "sign-only"`, `hex`, `signed`, `address` (signer), `txId`, `fee`, `method`, `contract`, `identity` |
| `--build-only` | `kind`, `mode: "build-only"`, `hex` (**unsigned**), `tx`, `fee`, `method`, `contract`, `identity` |
| `--dry-run` | `kind`, `mode: "dry-run"`, `fee`, unsigned `tx`, `method`, `contract`, plus `nonce` on EVM, `identity` |

`identity` holds `operator` and `requestedApproval` (`true` for this command). After a confirmed `--wait`, it adds `approved` — the permission read back from the registry, which should equal `requestedApproval`. If that read fails, you get a warning instead; do not send the transaction again.

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`execution_reverted` — the registry refused the call during estimation, with the raw revert data in `error.details.revertData`; `auth_required` — a signing mode without `--password-stdin`; `watch_only_no_signer`, `auth_failed`, `rpc_error`, `timeout` — on timeout the tx may still be in flight; check [`tx status`](../tx/status.md)) · `2` usage error (`invalid_value` — a malformed id or URI, or a bad option combination such as `--expiration` without `--sign-only` / `--build-only`; `family_mismatch` — an address of the other chain family; `invalid_option` — `--wait` with an early-exit mode; `unsupported_network_capability` — no registry on the selected network)

## See also

[`8004 remove-operator`](remove-operator.md) · [`8004 operator-check`](operator-check.md) · [`8004 approve`](approve.md)
