# wallet-cli exchange withdraw

Take liquidity out of a pair, in proportion to its reserves.

## Synopsis

```
wallet-cli exchange withdraw <id> --token <TRX|asset-id>
                             (--amount <n> | --raw-amount <n>)
                             [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]]
                             [--permission-id <n>] [options]
```

## Description

The mirror of [`exchange inject`](inject.md): you name one side and its amount, the other side follows the current reserve ratio, and both come back to your account. Only the pair's creator can withdraw.

**Amounts that do not divide cleanly by the reserve ratio are refused.** Converting one side to the other has a precision requirement on chain — the quotient must be exact to within 0.01% — and an amount that fails it is rejected outright rather than rounded, as `precision_loss`. Round the amount to something the ratio divides and try again.

**Tokens are named by id only** — `TRX` (or its on-chain id `_`) and a numeric TRC10 id; a TRC10 name may contain `:`. `--amount` is in whole tokens of the side you named; `--raw-amount` gives the same figure in minimal units. Exactly one of them is required.

**By default the command returns at submission** (`stage: "submitted"`), not confirmation — add `--wait` to block until confirmed/failed. Requires an account. The master password (via `--password-stdin`) is needed only by the modes that sign — `--dry-run` and `--build-only` do not unlock the wallet and run without it. Watch-only accounts fail with `watch_only_no_signer` in a signing mode.

## Options

| Option | Description |
|---|---|
| `<id>` | **Required.** Exchange pair id |
| `--token <TRX\|asset-id>` | **Required.** The side you are specifying |
| `--amount <n>` | Amount for that side in whole tokens; the other side follows the reserve ratio. One of `--amount` / `--raw-amount` |
| `--raw-amount <n>` | The same amount in minimal units. One of `--amount` / `--raw-amount` |
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
echo "$PW" | wallet-cli exchange withdraw 12 --token TRX --amount 1000 --network tron:nile --wait --password-stdin
```

```console
✅ Liquidity withdrawn
  Exchange id  12
  Creator      TQkXm4vN...5Zt7Uw
  Withdrawn    1,000 TRX / 50,000 MyToken
  Reserves     10,000 TRX / 500,000 MyToken
  TxID         8f6...
  Block        #57,884,310
  Fee          0 TRX
  Status       success
```

```bash
echo "$PW" | wallet-cli exchange withdraw 12 --token TRX --amount 1000 --network tron:nile --wait --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"exchange.withdraw","data":{"kind":"exchange-withdraw","stage":"confirmed","txId":"8f6...","confirmed":true,"blockNumber":57884310,"failed":false,"exchangeId":12,"pair":"TRX:1000123","creatorAddress":"TQkXm4vN...","tokenId":"_","tokenQuant":"1000000000","tokenLabel":"TRX","tokenDecimals":6,"otherTokenId":"1000123","otherTokenQuant":"50000000000","otherTokenLabel":"MyToken","otherTokenDecimals":6,"reserveAfter":"10000000000","otherReserveAfter":"500000000000","feeSun":0},"meta":{"durationMs":6460,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data` is flat, and identical in shape to [`exchange inject`](inject.md#output):

| Field | Type | Meaning |
|---|---|---|
| `exchangeId` / `pair` / `creatorAddress` | number / string / string | The pair and its creator |
| `tokenId` / `tokenQuant` | string | The side you named and the amount returned from it, in minimal units |
| `tokenLabel` / `tokenDecimals` | string / number | How text renders that side in whole tokens |
| `otherTokenId` / `otherTokenQuant` / `otherTokenLabel` / `otherTokenDecimals` | — | The same four for the side computed from the ratio |
| `reserveAfter` / `otherReserveAfter` | string | The pair's balances after this withdrawal, same order |

TRX is identified as `"_"`; every quantity is a **string** in minimal units. `--wait` adds `stage: "confirmed"`, `confirmed`, `blockNumber`, `feeSun`, `failed`.

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`exchange_not_found` — no such pair, `not_exchange_creator`, `token_not_in_exchange`, `exchange_closed` — a side holds zero, `insufficient_reserve` — more than that side holds, `precision_loss` — the amount does not convert cleanly, `watch_only_no_signer`, `auth_failed`) · `2` usage error (`missing_option` — no `--token`; `invalid_option` — both or neither of `--amount` / `--raw-amount`; `invalid_amount` — the amount is not a decimal number, or has more decimal places than that token allows; `invalid_value` — amount ≤ 0, or so small that the computed other side works out to zero).

## See also

[`exchange inject`](inject.md) · [`exchange show`](show.md) · [Script safety](../../machine-interface.md#script-safety-never-mistake-submitted-for-confirmed)
