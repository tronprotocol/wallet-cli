# wallet-cli exchange inject

Add liquidity to a pair, in proportion to its reserves.

## Synopsis

```
wallet-cli exchange inject <id> --token <TRX|asset-id>
                           (--amount <n> | --raw-amount <n>)
                           [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]]
                           [--permission-id <n>] [options]
```

## Description

**Injection is two-sided.** You name one side and its amount; the chain computes the other side from the current reserve ratio and debits that as well. `--token TRX --amount 1000` on a pair holding 10,000 TRX and 500,000 tokens therefore also takes 50,000 tokens — you need enough of **both**, not just the one you named.

Only the pair's creator can inject; any other account fails with `not_exchange_creator`.

If the amount is so small that the computed other side rounds to zero, the chain rejects the transaction. That case is caught locally against the current reserves rather than broadcast.

**Tokens are named by id only** — `TRX` (or its on-chain id `_`) and a numeric TRC10 id; a TRC10 name may contain `:`. `--amount` is in whole tokens of the side you named and is converted using its precision; `--raw-amount` gives the same figure in minimal units. Exactly one of them is required.

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
echo "$PW" | wallet-cli exchange inject 12 --token TRX --amount 1000 --network tron:nile --wait --password-stdin
```

```console
✅ Liquidity injected
  Exchange id  12
  Creator      TQkXm4vN...5Zt7Uw
  Injected     1,000 TRX / 50,000 MyToken
  Reserves     11,000 TRX / 550,000 MyToken
  TxID         5c3...
  Block        #57,884,180
  Fee          0 TRX
  Status       success
```

```bash
echo "$PW" | wallet-cli exchange inject 12 --token TRX --amount 1000 --network tron:nile --wait --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"exchange.inject","data":{"kind":"exchange-inject","stage":"confirmed","txId":"5c3...","confirmed":true,"blockNumber":57884180,"failed":false,"exchangeId":12,"pair":"TRX:1000123","creatorAddress":"TQkXm4vN...","tokenId":"_","tokenQuant":"1000000000","tokenLabel":"TRX","tokenDecimals":6,"otherTokenId":"1000123","otherTokenQuant":"50000000000","otherTokenLabel":"MyToken","otherTokenDecimals":6,"reserveAfter":"11000000000","otherReserveAfter":"550000000000","feeSun":0},"meta":{"durationMs":6440,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data` is flat — the side you named, the side that followed, and both reserves afterwards:

| Field | Type | Meaning |
|---|---|---|
| `exchangeId` / `pair` / `creatorAddress` | number / string / string | The pair and its creator |
| `tokenId` / `tokenQuant` | string | The side you named and the amount debited from it, in minimal units |
| `tokenLabel` / `tokenDecimals` | string / number | How text renders that side in whole tokens |
| `otherTokenId` / `otherTokenQuant` / `otherTokenLabel` / `otherTokenDecimals` | — | The same four for the side computed from the ratio |
| `reserveAfter` / `otherReserveAfter` | string | The pair's balances after this injection, same order |

TRX is identified as `"_"`; every quantity is a **string** in minimal units. Before confirmation the other side and both reserves are this command's own exact arithmetic; once confirmed the receipt's figure replaces it. `--wait` adds `stage: "confirmed"`, `confirmed`, `blockNumber`, `feeSun`, `failed`.

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`exchange_not_found` — no such pair, `not_exchange_creator`, `token_not_in_exchange`, `exchange_closed` — a side holds zero, `transaction_rejected` — the node refused it, for example for lack of balance, `watch_only_no_signer`, `auth_failed`) · `2` usage error (`missing_option` — no `--token`; `invalid_option` — both or neither of `--amount` / `--raw-amount`; `invalid_amount` — the amount is not a decimal number, or has more decimal places than that token allows; `invalid_value` — amount ≤ 0, or so small that the computed other side works out to zero).

## See also

[`exchange withdraw`](withdraw.md) · [`exchange show`](show.md) · [`exchange create`](create.md) · [Script safety](../../machine-interface.md#script-safety-never-mistake-submitted-for-confirmed)
