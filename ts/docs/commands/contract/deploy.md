# wallet-cli contract deploy

Deploy a smart contract.

## Synopsis

```
wallet-cli contract deploy --abi <json> --bytecode <hex> --fee-limit <sun>
                           [--constructor-sig <sig> --params <json>]
                           [--dry-run | --sign-only] [--wait [--wait-timeout <ms>]] [options]
```

## Description

Deploys compiled contract bytecode from the active account (or `--account`) and reports the new contract address. `--fee-limit` is **required** here (deployments are energy-heavy; there is no safe default). Constructor arguments go via `--constructor-sig` + `--params`.

Same execution model as other broadcast commands: `--dry-run` previews, `--sign-only` outputs a signed transaction for [`tx broadcast`](../tx/broadcast.md), default returns at submission, `--wait` blocks until confirmed/failed.

Requires an account and the master password via `--password-stdin`; watch-only accounts fail with `watch_only_no_signer`.

## Options

| Option | Description |
|---|---|
| `--abi <string>` | **Required.** Contract ABI as a JSON array string |
| `--bytecode <string>` | **Required.** Compiled bytecode as hex (0x-prefixed or bare) |
| `--fee-limit <number>` | **Required.** Max energy fee to burn, in SUN |
| `--constructor-sig <string>` | Constructor signature, e.g. `constructor(uint256)`; omit when no constructor args |
| `--params <string>` | Constructor args as a JSON array of `{type,value}` |
| `--dry-run` | Estimate only; excludes `--sign-only` |
| `--sign-only` | Sign without broadcasting; excludes `--dry-run` |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--password-stdin` | Master password from stdin |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```console
$ echo "$PW" | wallet-cli contract deploy --abi "$(cat MyToken.abi.json)" \
    --bytecode "$(cat MyToken.bin)" --fee-limit 1000000000 \
    --network tron:nile --password-stdin
⏳ Contract deployed
  Address  TXg3jWThoa5AxuwRA4aRyFAhmRN9hjhQFU
  TxID     b7c...
  Status   pending — not yet on-chain
! Track it: wallet-cli tx info --network tron:nile --txid b7c...
```

```console
$ echo "$PW" | wallet-cli contract deploy --abi "$(cat MyToken.abi.json)" \
    --bytecode "$(cat MyToken.bin)" --fee-limit 1000000000 --network tron:nile --password-stdin -o json
{"schema":"wallet-cli.result.v1","success":true,"command":"tron.contract.deploy","data":{"kind":"contract-deploy","contractAddress":"TXg3jWThoa5AxuwRA4aRyFAhmRN9hjhQFU","stage":"submitted","txId":"b7c..."},"meta":{"durationMs":15,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind: "contract-deploy"`, `contractAddress` (deterministic new address), `stage: "submitted"`, `txId` |
| `--wait` (confirmed) | above, plus `confirmed`, `blockNumber`, `feeSun`, `failed` |

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`watch_only_no_signer`, `wrong_password`, `rpc_error`, `timeout`) · `2` usage error (`invalid_value` — bad ABI/bytecode/params, missing `--fee-limit`).

## See also

[`contract info`](info.md) · [`contract send`](send.md) · [`tx status`](../tx/status.md)
