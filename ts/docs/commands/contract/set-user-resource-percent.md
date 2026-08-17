# wallet-cli contract set-user-resource-percent

Set the share of a call's energy paid by the caller.

## Synopsis

```
wallet-cli contract set-user-resource-percent <address> <percent>
                                              [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]]
                                              [--permission-id <n>] [options]
```

## Description

Sets `consume_user_resource_percent`: the percentage of a call's energy the **caller** pays. The remainder is covered by the deployer, itself capped by [`contract set-origin-energy-limit`](set-origin-energy-limit.md) and by the deployer's staked energy.

`100` means callers pay everything and the deployer subsidises nothing — which also makes the origin energy limit irrelevant. `0` means the deployer pays everything within those caps. The value is an integer 0–100, validated locally.

The number is the **caller's** share, matching the chain field's own direction; it is not inverted by this CLI.

Only the contract's deployer can do this; the current value is in [`contract info`](info.md). Settings take effect as soon as the transaction confirms.

**By default the command returns at submission** (`stage: "submitted"`), not confirmation — add `--wait` to block until confirmed/failed. Requires an account. The master password (via `--password-stdin`) is needed only by the modes that sign — `--dry-run` and `--build-only` do not unlock the wallet and run without it. Watch-only accounts fail with `watch_only_no_signer` in a signing mode.

## Options

| Option | Description |
|---|---|
| `<address>` | **Required.** Contract to configure; you must be its deployer |
| `<percent>` | **Required.** Share of energy paid by the caller, integer 0–100 |
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

Callers pay the full energy cost:

```bash
echo "$PW" | wallet-cli contract set-user-resource-percent TQ5nJ8mV...4wRe 100 --network tron:nile --wait --password-stdin
```

```console
✅ User pay ratio set
  Contract   TQ5nJ8mV...4wRe
  Deployer   TQkXm4vN...5Zt7Uw (main)
  User pays  100%
  TxID       8b2...
  Block      57,882,388
  Fee        0 TRX  (289 bandwidth)
  Status     success
```

```bash
echo "$PW" | wallet-cli contract set-user-resource-percent TQ5nJ8mV...4wRe 100 --network tron:nile --wait --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"contract.set-user-resource-percent","data":{"kind":"contract-set-user-resource-percent","stage":"confirmed","txId":"8b2...","confirmed":true,"blockNumber":57882388,"failed":false,"contractAddress":"TQ5nJ8mV...","deployerAddress":"TQkXm4vN...","consumeUserResourcePercent":100,"feeSun":0,"resource":{"netUsage":289,"netFeeSun":0,"energyUsage":0,"energyFeeSun":0}},"meta":{"durationMs":6470,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind: "contract-set-user-resource-percent"`, `stage: "submitted"`, `txId`, `contractAddress`, `deployerAddress`, `consumeUserResourcePercent` |
| `--wait` (confirmed) | above, plus `stage: "confirmed"`, `confirmed` (boolean), `blockNumber`, `feeSun`, `resource`, `failed` |

`consumeUserResourcePercent` is the value now in effect — the caller's share.

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`contract_not_found` — no such contract, `not_contract_deployer`, `watch_only_no_signer`, `auth_failed`) · `2` usage error (`invalid_value` — malformed address, or percent outside 0–100).

## See also

[`contract set-origin-energy-limit`](set-origin-energy-limit.md) · [`contract info`](info.md) · [Energy & bandwidth](../../concepts/energy-bandwidth.md) · [Script safety](../../machine-interface.md#script-safety-never-mistake-submitted-for-confirmed)
