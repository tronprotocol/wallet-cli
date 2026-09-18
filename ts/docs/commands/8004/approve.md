# wallet-cli 8004 approve

Approve an operator for one Agent, or clear the approval.

## Synopsis

```
wallet-cli 8004 approve <id> <operator>
wallet-cli 8004 approve <id> --revoke
                  [--wait [--wait-timeout <ms>] | --sign-only | --build-only | --dry-run]
                  [--fee-limit <sun>] [--permission-id <n>] [--expiration <ms>] [options]
```

## Description

Calls the registry's `approve(address,uint256)`. An approved operator can manage that one Agent — update its URI or transfer it. An Agent has at most one approved operator, so approving a new one replaces the old. The approval is cleared when the Agent is transferred.

`--revoke` clears the approval by approving the zero address; it takes no operator. To let an operator manage **all** of your Agents, use [`8004 add-operator`](add-operator.md) instead.

Only the owner, or an operator the owner added with [`8004 add-operator`](add-operator.md), can approve. The Agent's own approved operator cannot, and like anyone else is refused during fee estimation with `not_authorized`, before anything is signed. An Agent ID that does not exist fails with `agent_not_found`.

Requires an account. The master password (via `--password-stdin`) is needed only by the modes that sign.

Runs on networks with an ERC-8004 Identity Registry: `tron`, `nile`, `shasta`, `bsc`, `bsc-testnet`, `base`, `base-sepolia`. See [`8004`](index.md).

## Arguments

- `id` — Agent ID, optionally prefixed with its canonical network id (`<network-id>:<id>`, e.g. `tron:3448148188:172`; an alias such as `nile:172` is not accepted)
- `operator` — address to approve; required unless `--revoke`, and not allowed with it

## Options

| Option | Description |
|---|---|
| `--revoke` | Clear the current approval |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--sign-only` | Sign without broadcasting, output the signed hex; excludes `--dry-run` / `--build-only` |
| `--build-only` | Build and estimate, output the **unsigned** hex without unlocking the wallet; excludes `--dry-run` / `--sign-only` |
| `--dry-run` | Estimate only, no signature/broadcast; excludes `--sign-only` / `--build-only` |
| `--password-stdin` | Master password from stdin |

TRON only:

| Option | Description |
|---|---|
| `--fee-limit <sun>` | Max energy fee to burn, in SUN (default 100000000) |
| `--permission-id <n>` | Permission group to sign with (0=owner, 1=witness, 2–9=active); default `0` |
| `--expiration <ms>` | Transaction expiration in ms, up to `86400000` (24h); only with `--sign-only` or `--build-only`; omitted = node default (~60s) |

There are no EVM fee flags: on EVM the gas limit and fees come from the node's estimate, and `--gas-limit` and the like are refused as unknown options.

Plus the [global options](../index.md#global-options-every-command).

## Examples

Let `TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH` manage Agent 173. `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`.

```bash
printf '%s' "$PW" | wallet-cli 8004 approve 173 TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH --network nile --wait --password-stdin
```

```console
✅ Called approve
  Contract  TDDk4vc69nzBCbsY4kfu7gw2jmvbinirj5
  Agent ID  173
  Operator  TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH
  TxID      aae465db71a0d35aeaa7d9818c71f52f52dfcc1d2efc7245656710c2bb525635
  Block     #71,015,912
  Energy    22,778
  Fee       2.6227 TRX
  Status    success
```

```bash
printf '%s' "$PW" | wallet-cli 8004 approve 173 TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH --network nile --wait --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"8004.approve","data":{"kind":"contract-send","stage":"confirmed","txId":"50ac14a81ef8959d3c7bb1eb8ce20d528ceaf8e289e577738725d58e80eef164","confirmed":true,"blockNumber":71015914,"feeSun":2622700,"energyUsed":22778,"energyFeeSun":2277700,"netFeeSun":345000,"result":"SUCCESS","failed":false,"identity":{"operator":"TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH","agentId":"173"},"method":"approve(address,uint256)","contract":"TDDk4vc69nzBCbsY4kfu7gw2jmvbinirj5"},"meta":{"durationMs":6841,"warnings":[]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

To clear the approval later, run `8004 approve 173 --revoke`; its receipt shows the zero address as the operator.

## Output

`data` varies by stage:

| Mode | Fields |
|---|---|
| default (submit) | `kind: "contract-send"`, `stage: "submitted"`, `txId`, `method`, `contract`, `identity` |
| `--wait` (confirmed/failed) | above, but `stage: "confirmed"` or `"failed"`, plus `confirmed`, `blockNumber`, `failed`, and the realised cost — `feeSun` / `energyUsed` / `energyFeeSun` / `netFeeSun` / `result` on TRON, `gasUsed` / `feeWei` / `effectiveGasPriceWei` on EVM |
| `--sign-only` | `kind`, `mode: "sign-only"`, `hex`, `signed`, `address` (signer), `txId`, `fee`, `method`, `contract`, `identity` |
| `--build-only` | `kind`, `mode: "build-only"`, `hex` (**unsigned**), `tx`, `fee`, `method`, `contract`, `identity` |
| `--dry-run` | `kind`, `mode: "dry-run"`, `fee`, unsigned `tx`, `method`, `contract`, plus `nonce` on EVM, `identity` |

`identity` holds `agentId` and `operator` — the zero address for `--revoke`.

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`not_authorized` — the account may not do this for this Agent; `agent_not_found` — no Agent with that id; `execution_reverted` — the registry refused the call for another reason, with the raw revert data in `error.details.revertData`; `auth_required` — a signing mode without `--password-stdin`; `watch_only_no_signer`, `auth_failed`, `rpc_error`, `timeout` — on timeout the tx may still be in flight; check [`tx status`](../tx/status.md)) · `2` usage error (`invalid_value` — a malformed id or URI, or a bad option combination such as `--expiration` without `--sign-only` / `--build-only`; `family_mismatch` — an address of the other chain family; `invalid_option` — `--wait` with an early-exit mode; `unsupported_network_capability` — no registry on the selected network)

## See also

[`8004 show`](show.md) · [`8004 add-operator`](add-operator.md)
