# wallet-cli stake delegate

Delegate resource to another address.

## Synopsis

```
wallet-cli stake delegate --receiver <address> --amount-sun <n>
                          [--resource energy|bandwidth] [--lock [--lock-period <blocks>]]
                          [--dry-run | --sign-only | --build-only] [--wait [--wait-timeout <ms>]] [options]
```

## Description

Lends the resource backed by your staked TRX to another address — the receiver gets the energy/bandwidth; the TRX itself never leaves your stake. Amount is expressed as the staked-TRX backing, in SUN. The receiver must be a different address than the owner.

`--lock` makes the delegation non-reclaimable for a period (`--lock-period` in blocks, ~3 s per block) — a guarantee for the receiver. Without it you can [`stake undelegate`](undelegate.md) any time.

Check how much you can still delegate with [`stake delegated`](delegated.md) (`Max delegatable`).

**By default the command returns at submission**; `--wait` blocks until confirmed. Requires an account. The master password (via `--password-stdin`) is needed only by the modes that sign — `--dry-run` and `--build-only` do not unlock the wallet and run without it. Watch-only accounts fail with `watch_only_no_signer` in a signing mode.

## Options

| Option | Description |
|---|---|
| `--amount-sun <string>` | **Required.** Staked-TRX amount backing the delegated resource, in SUN |
| `--receiver <string>` | **Required.** Address receiving the resource (must differ from owner) |
| `--resource <energy\|bandwidth>` | Resource type to delegate (default `bandwidth`) |
| `--lock` | Lock the delegation; prevents early undelegation |
| `--lock-period <number>` | Lock duration in blocks (~3 s/block); requires `--lock` |
| `--dry-run` | Estimate only, no signature/broadcast |
| `--sign-only` | Sign without broadcasting |
| `--build-only` | Build and output the unsigned transaction hex **without unlocking** — the entry point for [multi-party or offline signing](../tx/index.md) |
| `--permission-id <0-9>` | TRON permission group id used to authorize this transaction (default `0`) |
| `--expiration <ms>` | Expiration duration in ms (1–86400000); only with `--sign-only` / `--build-only` |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--password-stdin` | Master password from stdin |

`--dry-run`, `--sign-only`, and `--build-only` are mutually exclusive.

Plus the [global options](../index.md#global-options-every-command).

## Examples

In the examples, `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`.

Default — returns the **submitted** receipt:

```bash
echo "$PW" | wallet-cli stake delegate --receiver TYzp9RbQmtAjCtyGeHb9W7GRwjDKtjUvvx --amount-sun 1000000000 --resource energy --network tron:nile --password-stdin
```

```console
⏳ Delegated 1,000 TRX of energy
  To      TYzp9RbQmtAjCtyGeHb9W7GRwjDKtjUvvx
  TxID    b7c...
  Status  pending — not yet on-chain
! Track it: wallet-cli tx info --network tron:nile --txid b7c...
```

```bash
echo "$PW" | wallet-cli stake delegate --receiver TYzp9RbQmtAjCtyGeHb9W7GRwjDKtjUvvx --amount-sun 1000000000 --resource energy --network tron:nile --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"stake.delegate","data":{"kind":"stake-delegate","stage":"submitted","txId":"b7c...","amountSun":"1000000000","resource":"energy","receiver":"TYzp9RbQmtAjCtyGeHb9W7GRwjDKtjUvvx"},"meta":{"durationMs":15,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind: "stake-delegate"`, `stage: "submitted"`, `txId`, `amountSun` (string), `resource`, `receiver` |
| `--wait` (confirmed) | above, plus `confirmed`, `blockNumber`, `feeSun`, `failed` |

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`watch_only_no_signer`, `auth_failed`, `rpc_error`, `timeout`) · `2` usage error (`invalid_value` — receiver = owner, `--lock-period` without `--lock`).

## See also

[`stake undelegate`](undelegate.md) · [`stake delegated`](delegated.md) · [Energy & bandwidth](../../concepts/energy-bandwidth.md)
