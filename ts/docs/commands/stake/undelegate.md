# wallet-cli stake undelegate

Reclaim delegated resource (UnDelegateResourceV2).

## Synopsis

```
wallet-cli stake undelegate --receiver <address> --amount-sun <n>
                            [--resource energy|bandwidth]
                            [--dry-run | --sign-only] [--wait [--wait-timeout <ms>]] [options]
```

## Description

Takes back resource you previously delegated with [`stake delegate`](delegate.md). Identify the delegation by receiver + resource type; amount is the staked-TRX backing in SUN. Locked delegations cannot be reclaimed before their lock expires — see the `Locked until` column in [`stake delegated`](delegated.md).

Reclaiming is immediate (no waiting period — the TRX was staked all along, only the resource moves back).

**By default the command returns at submission**; `--wait` blocks until confirmed. Requires an account and the master password via `--password-stdin`; watch-only accounts fail with `watch_only_no_signer`.

## Options

| Option | Description |
|---|---|
| `--amount-sun <string>` | **Required.** Staked-TRX amount backing the resource to reclaim, in SUN |
| `--receiver <string>` | **Required.** Address that previously received the delegation |
| `--resource <energy\|bandwidth>` | Resource type to reclaim (default `bandwidth`) |
| `--dry-run` | Estimate only, no signature/broadcast; excludes `--sign-only` |
| `--sign-only` | Sign without broadcasting; excludes `--dry-run` |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--password-stdin` | Master password from stdin |

Plus the [global options](../index.md#global-options-every-command).

## Examples

Default — returns the **submitted** receipt:

```console
$ echo "$PW" | wallet-cli stake undelegate --receiver TYzp9RbQmtAjCtyGeHb9W7GRwjDKtjUvvx \
    --amount-sun 1000000000 --resource energy --network tron:nile --password-stdin
⏳ Reclaimed 1,000 TRX of energy
  From    TYzp9RbQmtAjCtyGeHb9W7GRwjDKtjUvvx
  TxID    c8d...
  Status  pending — not yet on-chain
! Track it: wallet-cli tx info --network tron:nile --txid c8d...
```

```console
$ echo "$PW" | wallet-cli stake undelegate --receiver TYzp9RbQmtAjCtyGeHb9W7GRwjDKtjUvvx \
    --amount-sun 1000000000 --resource energy --network tron:nile --password-stdin -o json
{"schema":"wallet-cli.result.v1","success":true,"command":"tron.stake.undelegate","data":{"kind":"stake-undelegate","stage":"submitted","txId":"c8d...","amountSun":"1000000000","resource":"energy","receiver":"TYzp9RbQmtAjCtyGeHb9W7GRwjDKtjUvvx"},"meta":{"durationMs":15,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind: "stake-undelegate"`, `stage: "submitted"`, `txId`, `amountSun` (string), `resource`, `receiver` |
| `--wait` (confirmed) | above, plus `confirmed`, `blockNumber`, `feeSun`, `failed` |

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`watch_only_no_signer`, `wrong_password`, `rpc_error`, `timeout`) · `2` usage error (`invalid_value`).

## See also

[`stake delegate`](delegate.md) · [`stake delegated`](delegated.md)
