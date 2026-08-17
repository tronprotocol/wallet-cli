# wallet-cli contract set-origin-energy-limit

Set the energy the deployer will cover per call.

## Synopsis

```
wallet-cli contract set-origin-energy-limit <address> <energy>
                                            [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]]
                                            [--permission-id <n>] [options]
```

## Description

Sets `origin_energy_limit` — the ceiling on how much energy the **deployer** is willing to pay for a single call to this contract.

It is not a cap on the contract, and not a cap on the caller. What the deployer actually covers is bounded by three things at once: this limit, the deployer's own staked energy, and the caller/deployer split from [`contract set-user-resource-percent`](set-user-resource-percent.md). Whatever the deployer's side cannot cover falls back to the caller. Two ways this ends up doing nothing: the deployer has no staked energy (the subsidy is zero regardless of this limit), or the user share is 100 % (the deployer's portion is zero, so this limit never comes into play).

`<energy>` must be an integer **greater than zero** — the chain rejects zero, and it is refused locally rather than broadcast.

Only the contract's deployer can do this; the current value is in [`contract info`](info.md). Settings take effect as soon as the transaction confirms.

**By default the command returns at submission** (`stage: "submitted"`), not confirmation — add `--wait` to block until confirmed/failed. Requires an account. The master password (via `--password-stdin`) is needed only by the modes that sign — `--dry-run` and `--build-only` do not unlock the wallet and run without it. Watch-only accounts fail with `watch_only_no_signer` in a signing mode.

## Options

| Option | Description |
|---|---|
| `<address>` | **Required.** Contract to configure; you must be its deployer |
| `<energy>` | **Required.** Per-call energy the deployer will cover, integer > 0 |
| `--dry-run` | Build and estimate only, no signature/broadcast; excludes `--sign-only` / `--build-only` |
| `--sign-only` | Sign without broadcasting, output the signed hex; excludes `--dry-run` / `--build-only`; pairs with `--expiration` |
| `--build-only` | Build only, output the **unsigned** hex; excludes `--dry-run` / `--sign-only`; pairs with `--expiration` |
| `--expiration <ms>` | Transaction expiration in ms, up to `86400000` (24h); only with `--sign-only` or `--build-only`; omitted = node default (~60s) |
| `--permission-id <n>` | Permission group to sign with (0=owner, 1=witness, 2-9=active); default `0` |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--password-stdin` | Master password from stdin (fd 0) |

Plus the [global options](../index.md#global-options-every-command).

## Examples

In the examples, `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`.

```bash
echo "$PW" | wallet-cli contract set-origin-energy-limit TQ5nJ8mV...4wRe 50000000 --network tron:nile --wait --password-stdin
```

```console
✅ Origin energy limit set
  Contract      TQ5nJ8mV...4wRe
  Deployer      TQkXm4vN...5Zt7Uw (main)
  Energy limit  50,000,000
  TxID          3a9...
  Block         57,882,265
  Fee           0 TRX  (290 bandwidth)
  Status        success
```

```bash
echo "$PW" | wallet-cli contract set-origin-energy-limit TQ5nJ8mV...4wRe 50000000 --network tron:nile --wait --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"contract.set-origin-energy-limit","data":{"kind":"contract-set-origin-energy-limit","stage":"confirmed","txId":"3a9...","confirmed":true,"blockNumber":57882265,"failed":false,"contractAddress":"TQ5nJ8mV...","deployerAddress":"TQkXm4vN...","originEnergyLimit":50000000,"feeSun":0,"resource":{"netUsage":290,"netFeeSun":0,"energyUsage":0,"energyFeeSun":0}},"meta":{"durationMs":6530,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind: "contract-set-origin-energy-limit"`, `stage: "submitted"`, `txId`, `contractAddress`, `deployerAddress`, `originEnergyLimit` |
| `--wait` (confirmed) | above, plus `stage: "confirmed"`, `confirmed` (boolean), `blockNumber`, `feeSun`, `resource`, `failed` |

`originEnergyLimit` is the value now in effect.

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`contract_not_found` — no such contract, `not_contract_deployer`, `watch_only_no_signer`, `auth_failed`) · `2` usage error (`invalid_value` — malformed address, or energy not an integer > 0).

## See also

[`contract set-user-resource-percent`](set-user-resource-percent.md) · [`contract info`](info.md) · [Energy & bandwidth](../../concepts/energy-bandwidth.md) · [Script safety](../../machine-interface.md#script-safety-never-mistake-submitted-for-confirmed)
