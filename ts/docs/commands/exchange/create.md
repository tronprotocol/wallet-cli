# wallet-cli exchange create

Create a Bancor exchange pair and seed both sides.

## Synopsis

```
wallet-cli exchange create --pair <tokenA>:<tokenB>
                           (--amounts <a>:<b> | --raw-amounts <a>:<b>)
                           [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]]
                           [--permission-id <n>] [options]
```

## Description

Creates a pair and puts the initial liquidity into it in the same transaction. Either side may be TRX or a TRC10 asset id, and the two must differ. Any account can create a pair.

**The creator binding is permanent.** From this point on, only the creating account can [inject](inject.md) or [withdraw](withdraw.md) this pair's liquidity, and the chain offers no way to move that right to another account. Creating from the wrong account leaves the liquidity under that account for good.

The creation fee is **burned** — the chain parameter `getExchangeCreateFee`, currently around 1,024 TRX, readable with [`chain params`](../chain/params.md) — and both initial amounts leave your account on top of it.

`--pair` and `--amounts` are positional to each other: `--pair TRX:1000123 --amounts 10000:500000` puts 10,000 on the TRX side and 500,000 on asset 1000123's side. That ratio is the pair's starting quote — here roughly 1 TRX to 50 tokens — and every trade thereafter moves it.

**Tokens are named by id only** — `TRX` (or its on-chain id `_`) and a numeric TRC10 id. A TRC10 name may itself contain `:`, which would make `--pair` ambiguous; find an id with [`asset info <name>`](../asset/info.md).

`--amounts` is in whole tokens and is converted using each side's precision; `--raw-amounts` gives the same two numbers in minimal units. Exactly one of them is required.

**By default the command returns at submission** (`stage: "submitted"`), not confirmation — add `--wait` to block until confirmed/failed. Requires an account. The master password (via `--password-stdin`) is needed only by the modes that sign — `--dry-run` and `--build-only` do not unlock the wallet and run without it. Watch-only accounts fail with `watch_only_no_signer` in a signing mode.

## Options

| Option | Description |
|---|---|
| `--pair <tokenA>:<tokenB>` | **Required.** The two sides — `TRX` or a TRC10 asset id; they must differ |
| `--amounts <a>:<b>` | Amount for each side in whole tokens, in `--pair` order; both > 0. Debited from your account and become the pair's reserves. One of `--amounts` / `--raw-amounts` |
| `--raw-amounts <a>:<b>` | The same two amounts in minimal units. One of `--amounts` / `--raw-amounts` |
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
echo "$PW" | wallet-cli exchange create --pair TRX:1000123 --amounts 10000:500000 --network tron:nile --wait --password-stdin
```

```console
✅ Exchange created
  Exchange id  12
  Creator      TQkXm4vN...5Zt7Uw
  Reserves     10,000 TRX / 500,000 MyToken
  TxID         2b7...
  Block        #57,884,020
  Fee          1,024 TRX
  Status       success
```

```bash
echo "$PW" | wallet-cli exchange create --pair TRX:1000123 --amounts 10000:500000 --network tron:nile --wait --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"exchange.create","data":{"kind":"exchange-create","stage":"confirmed","txId":"2b7...","confirmed":true,"blockNumber":57884020,"failed":false,"exchangeId":12,"pair":"TRX:1000123","creatorAddress":"TQkXm4vN...","firstTokenId":"_","firstTokenQuant":"10000000000","firstTokenLabel":"TRX","firstTokenDecimals":6,"secondTokenId":"1000123","secondTokenQuant":"500000000000","secondTokenLabel":"MyToken","secondTokenDecimals":6,"feeSun":1024000000},"meta":{"durationMs":6680,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind: "exchange-create"`, `stage: "submitted"`, `txId`, `pair`, `creatorAddress`, and both sides' `…TokenId` / `…TokenQuant` / `…TokenLabel` / `…TokenDecimals` |
| `--wait` (confirmed) | above, plus `stage: "confirmed"`, `confirmed` (boolean), `blockNumber`, `feeSun`, `failed`, and `exchangeId` — assigned by the chain, so known only once confirmed |

`firstTokenId` / `secondTokenId` are on-chain ids, so TRX appears as `"_"`. The quantities are **strings** in each token's minimal unit; `…TokenLabel` and `…TokenDecimals` are what text uses to print them as whole tokens.

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`same_token` — both sides identical, `asset_not_found` — no TRC10 with that id, `transaction_rejected` — the node refused it, for example for lack of balance or a reserve above `getExchangeBalanceLimit`, `watch_only_no_signer`, `auth_failed`) · `2` usage error (`missing_option` — no `--pair`; `invalid_option` — both or neither of `--amounts` / `--raw-amounts`; `invalid_amount` — a side is not a decimal number, or has more decimal places than that token allows; `invalid_value` — a malformed `<a>:<b>`, or a side ≤ 0).

## See also

[`exchange inject`](inject.md) · [`exchange trade`](trade.md) · [`exchange show`](show.md) · [`chain params`](../chain/params.md) · [Script safety](../../machine-interface.md#script-safety-never-mistake-submitted-for-confirmed)
