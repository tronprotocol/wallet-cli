# wallet-cli contract deploy

Deploy a smart contract.

## Synopsis

```
wallet-cli contract deploy --abi <json> --bytecode <hex> --fee-limit <sun>
                           [--params <json>]
                           [--dry-run | --sign-only | --build-only]
                           [--expiration <ms>] [--permission-id <n>] [--wait [--wait-timeout <ms>]] [options]
```

## Description

Deploys compiled contract bytecode from the active account (or `--account`) and reports the new contract address. `--fee-limit` is **required** here (deployments are energy-heavy; there is no safe default). Constructor types are read from the ABI; `--params` supplies raw positional values in that order.

Same execution model as other broadcast commands: `--dry-run` previews, `--sign-only` outputs a signed transaction for [`tx broadcast`](../tx/broadcast.md), and `--build-only` emits the unsigned transaction without touching a signer. `--expiration` is restricted to build/sign-only; `--permission-id` selects the TRON permission group. Default returns at submission and `--wait` blocks until confirmed/failed.

Requires an account and the master password via `--password-stdin`; watch-only accounts fail with `watch_only_no_signer`.

## Options

| Option | Description |
|---|---|
| `--abi <string>` | **Required.** Contract ABI as a JSON array string |
| `--bytecode <string>` | **Required.** Compiled bytecode as hex (0x-prefixed or bare) |
| `--fee-limit <number>` | **Required.** Max energy fee to burn, in SUN |
| `--params <string>` | Constructor args as a JSON array of raw positional values |
| `--dry-run` | Estimate only; excludes `--sign-only` |
| `--sign-only` | Sign without broadcasting; excludes `--dry-run` |
| `--build-only` | Build unsigned without signer access or broadcast |
| `--expiration <ms>` | Extend expiry in build/sign-only modes; max 86,400,000 |
| `--permission-id <n>` | TRON permission group; default 0 |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--password-stdin` | Master password from stdin |

Plus the [global options](../index.md#global-options-every-command).

## Examples

In the examples, `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`.

```bash
echo "$PW" | wallet-cli contract deploy --abi "$(cat MyToken.abi.json)" --bytecode "$(cat MyToken.bin)" --fee-limit 1000000000 --network tron:nile --password-stdin
```

```console
⏳ Contract deployed
  Address  TXg3jWThoa5AxuwRA4aRyFAhmRN9hjhQFU
  TxID     b7c...
  Status   pending — not yet on-chain
! Track it: wallet-cli tx info --network tron:nile --txid b7c...
```

```bash
echo "$PW" | wallet-cli contract deploy --abi "$(cat MyToken.abi.json)" --bytecode "$(cat MyToken.bin)" --fee-limit 1000000000 --network tron:nile --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"contract.deploy","data":{"kind":"contract-deploy","contractAddress":"TXg3jWThoa5AxuwRA4aRyFAhmRN9hjhQFU","stage":"submitted","txId":"b7c..."},"meta":{"durationMs":15,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind: "contract-deploy"`, `contractAddress` (deterministic new address), `stage: "submitted"`, `txId` |
| `--wait` (confirmed) | above, plus `confirmed`, `blockNumber`, `feeSun`, `failed` |
| `--dry-run` | `kind`, `mode: "dry-run"`, unsigned `tx`, fee estimate, deterministic `contractAddress` |
| `--sign-only` | `kind`, `mode: "sign-only"`, `signed`, signer address, tx id, `contractAddress` |
| `--build-only` | `kind`, `mode: "build-only"`, `unsigned`, `unsignedHex`, `contractAddress` |

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`watch_only_no_signer`, `auth_failed`, `rpc_error`, `timeout`) · `2` usage error (`invalid_value` — bad ABI/bytecode/params, missing `--fee-limit`).

## See also

[`contract info`](info.md) · [`contract send`](send.md) · [`tx status`](../tx/status.md)
