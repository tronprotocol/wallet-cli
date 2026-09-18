# wallet-cli 8004 register

Register a new Agent.

## Synopsis

```
wallet-cli 8004 register <uri>
                  [--wait [--wait-timeout <ms>] | --sign-only | --build-only | --dry-run]
                  [--fee-limit <sun>] [--permission-id <n>] [--expiration <ms>] [options]
```

## Description

Calls the registry's `register(string)` from the active account (or `--account`), which becomes the Agent's owner. The URI must point to a registration document you build and host yourself; wallet-cli does not create or check its content.

The URI must be `https://`, `ipfs://`, or a base64 JSON `data:` URI, at most 2048 characters, with no credentials in it. [`8004 show`](show.md) loads only `https://` and `http://` documents, so an Agent registered with an `ipfs://` or `data:` URI shows no registration details there; prefer `https://` if you want them readable with wallet-cli.

**The Agent ID is assigned by the chain.** The default submitted receipt has only `identity.uri`. With `--wait`, the receipt adds `identity.agentId` once the confirmed registration event can be read. Without `--wait`, read it from the transaction afterwards: in [`tx info`](../tx/info.md)` -o json`, the first entry of `data.info.log` is the registry's `Transfer` event, and its last topic is the Agent ID in hex (`…00aa` is Agent 170). Do not register again to get the id — that creates a second Agent.

Requires an account. The master password (via `--password-stdin`) is needed only by the modes that sign.

Runs on networks with an ERC-8004 Identity Registry: `tron`, `nile`, `shasta`, `bsc`, `bsc-testnet`, `base`, `base-sepolia`. See [`8004`](index.md).

## Arguments

- `uri` — URI of the registration document

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

Register an Agent on Nile and wait for its ID. The registration document here is a small `data:` URI. `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`.

```bash
printf '%s' "$PW" | wallet-cli 8004 register "data:application/json;base64,eyJuYW1lIjoiV2VhdGhlciBBZ2VudCIsImRlc2NyaXB0aW9uIjoiUmV0dXJucyB3ZWF0aGVyIGZvcmVjYXN0cyBmb3IgYSBjaXR5In0=" --network nile --wait --password-stdin
```

```console
✅ Called register
  Contract  TDDk4vc69nzBCbsY4kfu7gw2jmvbinirj5
  Agent ID  173
  URI       data:application/json;base64,eyJuYW1lIjoiV2VhdGhlciBBZ2VudCIsImRlc2NyaXB0aW9uIjoiUmV0dXJucyB3ZWF0aGVyIGZvcmVjYXN0cyBmb3IgYSBjaXR5In0=
  TxID      ee19cabbc6bfa4bc0201669c967c95f639a46128826f33b5fb27a9bb6de8a4c8
  Block     #71,015,894
  Energy    183,779
  Fee       18.8561 TRX
  Status    success
```

```bash
printf '%s' "$PW" | wallet-cli 8004 register "data:application/json;base64,eyJuYW1lIjoiV2VhdGhlciBBZ2VudCIsImRlc2NyaXB0aW9uIjoiUmV0dXJucyB3ZWF0aGVyIGZvcmVjYXN0cyBmb3IgYSBjaXR5In0=" --network nile --wait --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"8004.register","data":{"kind":"contract-send","stage":"confirmed","txId":"6850f29e0eff687d0f0f41515a067fced277cd0fd0bbe2773371268cd14894ee","confirmed":true,"blockNumber":71015896,"feeSun":18884800,"energyUsed":183779,"energyFeeSun":18377800,"netFeeSun":507000,"result":"SUCCESS","failed":false,"method":"register(string)","contract":"TDDk4vc69nzBCbsY4kfu7gw2jmvbinirj5","identity":{"uri":"data:application/json;base64,eyJuYW1lIjoiV2VhdGhlciBBZ2VudCIsImRlc2NyaXB0aW9uIjoiUmV0dXJucyB3ZWF0aGVyIGZvcmVjYXN0cyBmb3IgYSBjaXR5In0=","agentId":"173"}},"meta":{"durationMs":6869,"warnings":[]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

The new Agent ID is `173` — in JSON, `data.identity.agentId`. `Fee` is the TRX burned for the energy the registration used.

## Output

`data` varies by stage:

| Mode | Fields |
|---|---|
| default (submit) | `kind: "contract-send"`, `stage: "submitted"`, `txId`, `method`, `contract`, `identity` |
| `--wait` (confirmed/failed) | above, but `stage: "confirmed"` or `"failed"`, plus `confirmed`, `blockNumber`, `failed`, and the realised cost — `feeSun` / `energyUsed` / `energyFeeSun` / `netFeeSun` / `result` on TRON, `gasUsed` / `feeWei` / `effectiveGasPriceWei` on EVM |
| `--sign-only` | `kind`, `mode: "sign-only"`, `hex`, `signed`, `address` (signer), `txId`, `fee`, `method`, `contract`, `identity` |
| `--build-only` | `kind`, `mode: "build-only"`, `hex` (**unsigned**), `tx`, `fee`, `method`, `contract`, `identity` |
| `--dry-run` | `kind`, `mode: "dry-run"`, `fee`, unsigned `tx`, `method`, `contract`, plus `nonce` on EVM, `identity` |

`identity` holds `uri`, plus `agentId` (decimal string) after a confirmed `--wait`.

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`execution_reverted` — the registry refused the call during estimation, with the raw revert data in `error.details.revertData`; `auth_required` — a signing mode without `--password-stdin`; `watch_only_no_signer`, `auth_failed`, `rpc_error`, `timeout` — on timeout the tx may still be in flight; check [`tx status`](../tx/status.md)) · `2` usage error (`invalid_value` — a malformed id or URI, or a bad option combination such as `--expiration` without `--sign-only` / `--build-only`; `family_mismatch` — an address of the other chain family; `invalid_option` — `--wait` with an early-exit mode; `unsupported_network_capability` — no registry on the selected network)

## See also

[`8004 show`](show.md) · [`8004 update`](update.md) · [Script safety](../../machine-interface.md#script-safety-never-mistake-submitted-for-confirmed)
