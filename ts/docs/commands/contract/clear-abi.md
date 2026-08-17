# wallet-cli contract clear-abi

Clear the ABI a contract stores on chain.

## Synopsis

```
wallet-cli contract clear-abi <address>
                              [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]]
                              [--permission-id <n>] [options]
```

## Description

Removes the ABI held on chain for a contract. **This cannot be undone** — the ABI is gone from the chain, and anything that decoded calls by reading it (explorers, SDKs, [`contract call`](call.md)) must supply its own from then on.

What it does **not** touch: the bytecode and the contract's state are unaffected, and the contract stays callable exactly as before. The ABI is auxiliary metadata, not part of execution.

Only the contract's deployer can do this — the address the chain records as the contract's origin, visible in [`contract info`](info.md). Other accounts fail with `not_contract_deployer`.

**By default the command returns at submission** (`stage: "submitted"`), not confirmation — add `--wait` to block until confirmed/failed. Requires an account. The master password (via `--password-stdin`) is needed only by the modes that sign — `--dry-run` and `--build-only` do not unlock the wallet and run without it. Watch-only accounts fail with `watch_only_no_signer` in a signing mode.

## Options

| Option | Description |
|---|---|
| `<address>` | **Required.** Contract whose ABI to clear |
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
echo "$PW" | wallet-cli contract clear-abi TQ5nJ8mV...4wRe --network tron:nile --wait --password-stdin
```

```console
✅ ABI cleared
  Contract  TQ5nJ8mV...4wRe
  Deployer  TQkXm4vN...5Zt7Uw (main)
  TxID      3f7...
  Block     57,882,140
  Fee       0 TRX  (287 bandwidth)
  Status    success
```

```bash
echo "$PW" | wallet-cli contract clear-abi TQ5nJ8mV...4wRe --network tron:nile --wait --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"contract.clear-abi","data":{"kind":"contract-clear-abi","stage":"confirmed","txId":"3f7...","confirmed":true,"blockNumber":57882140,"failed":false,"contractAddress":"TQ5nJ8mV...","deployerAddress":"TQkXm4vN...","feeSun":0,"resource":{"netUsage":287,"netFeeSun":0,"energyUsage":0,"energyFeeSun":0}},"meta":{"durationMs":6510,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind: "contract-clear-abi"`, `stage: "submitted"`, `txId`, `contractAddress`, `deployerAddress` |
| `--wait` (confirmed) | above, plus `stage: "confirmed"`, `confirmed` (boolean), `blockNumber`, `feeSun`, `resource`, `failed` |

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`contract_not_found` — no such contract, `not_contract_deployer`, `watch_only_no_signer`, `auth_failed`) · `2` usage error (`invalid_value` — malformed address).

## See also

[`contract info`](info.md) · [`contract deploy`](deploy.md) · [Script safety](../../machine-interface.md#script-safety-never-mistake-submitted-for-confirmed)
