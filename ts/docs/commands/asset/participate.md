# wallet-cli asset participate

Buy into a TRC10's ICO with TRX.

## Synopsis

```
wallet-cli asset participate <asset> --pay <trx>
                             [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]]
                             [--permission-id <n>] [options]
```

## Description

Buys from a token's issuance inside its funding window, at the fixed rate set when it was issued. This is participation in the ICO, not a market trade — the tokens come out of the issuer's remaining supply, and the price is not negotiable. The issuer's address is resolved from the token, so there is nothing to pass for it.

**`--pay` is the TRX you spend, not the tokens you receive.** You get `floor(pay × tokens ÷ trx)` where `trx:tokens` is the token's issued rate — the amount paid times the unit price, rounded down, since the chain multiplies before dividing on integers. The TRX is transferred in full, so any truncated remainder is not refunded; the loss is under 1 sun and cannot occur at all when the rate's `trxNum` is 1. If `--pay` is too small to buy even one unit, the command fails locally rather than broadcasting.

The acting account cannot be the token's own issuer.

**By default the command returns at submission** (`stage: "submitted"`), not confirmation — add `--wait` to block until confirmed/failed. Requires an account. The master password (via `--password-stdin`) is needed only by the modes that sign — `--dry-run` and `--build-only` do not unlock the wallet and run without it. Watch-only accounts fail with `watch_only_no_signer` in a signing mode.

## Options

| Option | Description |
|---|---|
| `<asset>` | **Required.** Token id or name; an all-digit value is read as the id |
| `--pay <trx>` | **Required.** TRX to spend (not a token count), > 0 |
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

Spend 100 TRX on a token issued at `1:100`:

```bash
echo "$PW" | wallet-cli asset participate 1000124 --pay 100 --network tron:nile --wait --password-stdin
```

```console
✅ Participated in ICO
  Asset        BetaToken  (id 1000124)
  Issuer       TBeta9mR...8pLx
  Participant  TQkXm4vN...5Zt7Uw (main)
  Paid         100 TRX
  Received     10,000 BetaToken
  TxID         4c8...
  Block        57,883,402
  Fee          0 TRX  (301 bandwidth)
  Status       success
```

```bash
echo "$PW" | wallet-cli asset participate 1000124 --pay 100 --network tron:nile --wait --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"asset.participate","data":{"kind":"asset-participate","stage":"confirmed","txId":"4c8...","confirmed":true,"blockNumber":57883402,"failed":false,"assetId":"1000124","name":"BetaToken","issuerAddress":"TBeta9mR...","participantAddress":"TQkXm4vN...","paidSun":100000000,"receivedAmount":10000000000,"feeSun":0,"resource":{"netUsage":301,"netFeeSun":0,"energyUsage":0,"energyFeeSun":0}},"meta":{"durationMs":6450,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind: "asset-participate"`, `stage: "submitted"`, `txId`, `assetId`, `name`, `issuerAddress`, `participantAddress`, `paidSun`, `receivedAmount` |
| `--wait` (confirmed) | above, plus `stage: "confirmed"`, `confirmed` (boolean), `blockNumber`, `feeSun`, `resource`, `failed` |

`paidSun` is the TRX spent in sun; `receivedAmount` is the token amount in its smallest unit (text shows both in human units).

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`asset_not_found` — no such token, `not_in_ico_window` — outside the funding window, `self_participation` — you issued this token, `insufficient_balance`, `watch_only_no_signer`, `auth_failed`) · `2` usage error (`missing_option` — no `--pay`; `invalid_amount` — `--pay` is not a decimal number, or has more than 6 decimal places; `invalid_value` — `--pay` ≤ 0, or too small to buy one unit).

## See also

[`asset info`](info.md) · [`tx send`](../tx/send.md) · [`exchange trade`](../exchange/trade.md) · [Script safety](../../machine-interface.md#script-safety-never-mistake-submitted-for-confirmed)
