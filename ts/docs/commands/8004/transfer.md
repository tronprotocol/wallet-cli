# wallet-cli 8004 transfer

Transfer an Agent to a new owner.

## Synopsis

```
wallet-cli 8004 transfer <id> <newOwner>
                  [--wait [--wait-timeout <ms>] | --sign-only | --build-only | --dry-run]
                  [--fee-limit <sun>] [--permission-id <n>] [--expiration <ms>] [options]
```

## Description

Calls the registry's `transferFrom(address,address,uint256)`, moving the Agent from its current owner to `newOwner`. The signing account must be the owner, the Agent's approved operator, or an operator the owner added with [`8004 add-operator`](add-operator.md); otherwise the call is refused during fee estimation with `not_authorized`, before anything is signed. An Agent ID that does not exist fails with `agent_not_found`, and `newOwner` may not be the zero address (`invalid_address`).

**The transfer is final** — after it, only the new owner can update, approve, or transfer the Agent. Check `newOwner` before sending.

The receipt names the owner read before the transfer (`oldOwner`) and the one requested. With `--wait`, it reads the owner again after confirmation and adds `newOwner`; if that read fails, you get a warning instead.

Requires an account. The master password (via `--password-stdin`) is needed only by the modes that sign.

Runs on networks with an ERC-8004 Identity Registry: `tron`, `nile`, `shasta`, `bsc`, `bsc-testnet`, `base`, `base-sepolia`. See [`8004`](index.md).

## Arguments

- `id` — Agent ID, optionally prefixed with its canonical network id (`<network-id>:<id>`, e.g. `tron:3448148188:172`; an alias such as `nile:172` is not accepted)
- `newOwner` — address of the new owner, on the selected network's family

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
| `--permission-id <n>` | Permission group to sign with (0=owner, 1=witness, 2–9=active); default `0` |
| `--expiration <ms>` | Transaction expiration in ms, up to `86400000` (24h); only with `--sign-only` or `--build-only`; omitted = node default (~60s) |

There are no EVM fee flags: on EVM the gas limit and fees come from the node's estimate, and `--gas-limit` and the like are refused as unknown options.

Plus the [global options](../index.md#global-options-every-command).

## Examples

Transfer Agent 173 to `TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH`. `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`.

```bash
printf '%s' "$PW" | wallet-cli 8004 transfer 173 TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH --network nile --wait --password-stdin
```

```console
✅ Called transferFrom
  Contract         TDDk4vc69nzBCbsY4kfu7gw2jmvbinirj5
  Agent ID         173
  Previous owner   TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ
  Requested owner  TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH
  Current owner    TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH
  TxID             2aa501c87a95185515098b2e333600f8e51a1277ad8b0ff8c8bf2ded59df3a57
  Block            #71,015,932
  Energy           31,998
  Fee              3.5777 TRX
  Status           success
```

```bash
printf '%s' "$PW" | wallet-cli 8004 transfer 173 TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH --network nile --wait --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"8004.transfer","data":{"kind":"contract-send","stage":"confirmed","txId":"ca42c4fe2d6246178042bbb205ff3359a821c6f260f776bb267aa7c73072ba44","confirmed":true,"blockNumber":71015936,"feeSun":3577700,"energyUsed":31998,"energyFeeSun":3199700,"netFeeSun":378000,"result":"SUCCESS","failed":false,"method":"transferFrom(address,address,uint256)","contract":"TDDk4vc69nzBCbsY4kfu7gw2jmvbinirj5","identity":{"agentId":"173","oldOwner":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","requestedOwner":"TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH","newOwner":"TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH"}},"meta":{"durationMs":12076,"warnings":[]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

`Current owner` is read back after confirmation and matches the requested owner, so the transfer took effect.

## Output

`data` varies by stage:

| Mode | Fields |
|---|---|
| default (submit) | `kind: "contract-send"`, `stage: "submitted"`, `txId`, `method`, `contract`, `identity` |
| `--wait` (confirmed/failed) | above, but `stage: "confirmed"` or `"failed"`, plus `confirmed`, `blockNumber`, `failed`, and the realised cost — `feeSun` / `energyUsed` / `energyFeeSun` / `netFeeSun` / `result` on TRON, `gasUsed` / `feeWei` / `effectiveGasPriceWei` on EVM |
| `--sign-only` | `kind`, `mode: "sign-only"`, `hex`, `signed`, `address` (signer), `txId`, `fee`, `method`, `contract`, `identity` |
| `--build-only` | `kind`, `mode: "build-only"`, `hex` (**unsigned**), `tx`, `fee`, `method`, `contract`, `identity` |
| `--dry-run` | `kind`, `mode: "dry-run"`, `fee`, unsigned `tx`, `method`, `contract`, plus `nonce` on EVM, `identity` |

`identity` holds `agentId`, `oldOwner` and `requestedOwner`, plus `newOwner` after a confirmed `--wait`.

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`not_authorized` — the account may not do this for this Agent; `agent_not_found` — no Agent with that id; `execution_reverted` — the registry refused the call for another reason, with the raw revert data in `error.details.revertData`; `auth_required` — a signing mode without `--password-stdin`; `watch_only_no_signer`, `auth_failed`, `rpc_error`, `timeout` — on timeout the tx may still be in flight; check [`tx status`](../tx/status.md)) · `2` usage error (`invalid_address` — `newOwner` is not a valid address, or is the zero address; `invalid_value` — a malformed id or URI, or a bad option combination such as `--expiration` without `--sign-only` / `--build-only`; `family_mismatch` — an address of the other chain family; `invalid_option` — `--wait` with an early-exit mode; `unsupported_network_capability` — no registry on the selected network)

## See also

[`8004 show`](show.md) · [`8004 approve`](approve.md)
