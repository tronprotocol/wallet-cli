# wallet-cli asset issue

Issue a TRC10 token and lock in its ICO terms.

## Synopsis

```
wallet-cli asset issue --name <name> --supply <n> --price <trx>:<tokens>
                       --start <datetime> --end <datetime> --url <url>
                       [--abbr <s>] [--precision <0-6>] [--description <s>]
                       [--free-net-per-account <n>] [--public-free-net <n>]
                       [--freeze <amount>:<days> ...]
                       [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]]
                       [--permission-id <n>] [options]
```

## Description

Creates a TRC10 token and, in the same transaction, fixes the terms of its ICO: total supply, precision, the TRX-to-token rate, the funding window, and any frozen tranches.

**This cannot be undone.** The issuance fee is burned — the chain parameter `getAssetIssueFee`, currently around 1,024 TRX, readable with [`chain params`](../chain/params.md) — and an account may issue **only one TRC10 in its lifetime**. Afterwards only the description, the URL, and the two free-bandwidth limits can be changed ([`asset update`](update.md)); everything else is permanent. The receipt therefore echoes the complete definition, because that is the final one.

**`--price` is converted using `--precision`.** The chain stores the rate as an integer pair `trxNum` / `num` satisfying `num ÷ trxNum = tokens × 10^precision ÷ (trx × 10^6)`, reduced to lowest terms. So `--price 1:100` is stored as `trxNum=1, num=100` at `--precision 6`, but as `trxNum=10000, num=1` at `--precision 0` — the same flag, a different on-chain rate. Both values must land in the positive int32 range after reduction; otherwise the command fails with `invalid_value` and nothing is broadcast.

Amounts (`--supply`, `--freeze`) are in **whole tokens** — `--supply 1000000000 --precision 6` becomes an on-chain `total_supply` of `1000000000000000`.

Dates are read as **UTC**, as `YYYY-MM-DD` or `YYYY-MM-DD HH:mm:ss`; a bare date means `00:00:00`. `--start` must be later than the chain's current time, so a bare date is at the earliest tomorrow — to start a sale the same day, give the time as well.

Constraints are checked locally before broadcast: `--name` and `--abbr` are 1–32 visible ASCII characters (`0x21`–`0x7E`, so no spaces and no non-ASCII); `--url` is required and at most 256 bytes; `--description` at most 200 bytes; `--precision` 0–6; `--end` after `--start`; each `--freeze` tranche's days within `getMinFrozenSupplyTime`…`getMaxFrozenSupplyTime`, the number of tranches within `getMaxFrozenSupplyNumber`, and their sum within the total supply; both free-bandwidth limits below `getOneDayNetLimit`.

**By default the command returns at submission** (`stage: "submitted"`), not confirmation — add `--wait` to block until confirmed/failed. Requires an account. The master password (via `--password-stdin`) is needed only by the modes that sign — `--dry-run` and `--build-only` do not unlock the wallet and run without it. Watch-only accounts fail with `watch_only_no_signer` in a signing mode.

## Options

| Option | Description |
|---|---|
| `--name <name>` | **Required.** Token name, 1–32 visible ASCII characters |
| `--supply <n>` | **Required.** Total supply in whole tokens, > 0 |
| `--price <trx>:<tokens>` | **Required.** ICO rate, whole TRX to whole tokens (e.g. `1:100`); both sides > 0, converted using `--precision` |
| `--start <datetime>` | **Required.** ICO start, UTC; must be in the future |
| `--end <datetime>` | **Required.** ICO end, UTC; must be after `--start` |
| `--url <url>` | **Required.** Project page, non-empty, ≤ 256 bytes |
| `--abbr <s>` | Token abbreviation; same character rules as `--name` (default: empty) |
| `--precision <0-6>` | Decimal places (default `0`) |
| `--description <s>` | Short description, ≤ 200 bytes (default: empty) |
| `--free-net-per-account <n>` | Free bandwidth each holder may use (default `0`) |
| `--public-free-net <n>` | Shared free-bandwidth pool for holders (default `0`) |
| `--freeze <amount>:<days>` | **Repeatable.** Frozen tranche; amount in whole tokens, e.g. `100000000:30` |
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
echo "$PW" | wallet-cli asset issue --name MyToken --abbr MTK --supply 1000000000 --price 1:100 --precision 6 \
  --start 2026-08-01 --end 2026-08-31 --url https://mytoken.io --description "Demo TRC10" \
  --freeze 100000000:30 --freeze 50000000:90 --network tron:nile --wait --password-stdin
```

```console
✅ Asset issued
  Asset             MyToken  (id 1000123)
  Issuer            TQkXm4vN...5Zt7Uw (main)
  Total supply      1,000,000,000
  Precision         6
  Price             1 TRX = 100 MyToken
  ICO start time    2026-08-01 00:00 UTC
  ICO end time      2026-08-31 00:00 UTC
  Url               https://mytoken.io
  Description       Demo TRC10
  Free net/account  0
  Public free net   0
  Frozen (2)
    100,000,000  for 30 days
     50,000,000  for 90 days
  TxID              7d1...
  Block             57,883,010
  Fee               1,024 TRX  (312 bandwidth)
  Status            success
```

```bash
echo "$PW" | wallet-cli asset issue --name MyToken --abbr MTK --supply 1000000000 --price 1:100 --precision 6 \
  --start 2026-08-01 --end 2026-08-31 --url https://mytoken.io --network tron:nile --wait --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"asset.issue","data":{"kind":"asset-issue","stage":"confirmed","txId":"7d1...","confirmed":true,"blockNumber":57883010,"failed":false,"assetId":"1000123","name":"MyToken","abbr":"MTK","totalSupply":1000000000000000,"precision":6,"price":"1:100","trxNum":1,"num":100,"startTime":1785542400000,"endTime":1788134400000,"url":"https://mytoken.io","description":"Demo TRC10","freeAssetNetLimit":0,"publicFreeAssetNetLimit":0,"frozenSupply":[{"amount":100000000000000,"days":30},{"amount":50000000000000,"days":90}],"feeSun":1024000000,"resource":{"netUsage":312,"netFeeSun":0,"energyUsage":0,"energyFeeSun":0}},"meta":{"durationMs":6720,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind: "asset-issue"`, `stage: "submitted"`, `txId`, and the token definition below except `assetId` |
| `--wait` (confirmed) | above, plus `stage: "confirmed"`, `confirmed` (boolean), `blockNumber`, `feeSun`, `resource`, `failed`, and `assetId` — assigned by the chain, so known only once confirmed |

Definition fields: `name`, `abbr`, `totalSupply` (raw), `precision`, `price` (the `trx:tokens` string as given) with the stored `trxNum` / `num` pair, `startTime` / `endTime` (ms since epoch), `url`, `description`, `freeAssetNetLimit`, `publicFreeAssetNetLimit`, and `frozenSupply[]` (`amount` raw, `days`).

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`already_issued_asset` — this account already issued one, `insufficient_balance` — below the issuance fee, `watch_only_no_signer`, `auth_failed`) · `2` usage error (`missing_option` — a required flag is absent; `invalid_asset_name` — name or abbreviation outside 1–32 visible ASCII; `invalid_value` — rate, precision, dates, bandwidth limits, or frozen tranches out of range, or the rate exceeding int32 after conversion).

## See also

[`asset update`](update.md) · [`asset info`](info.md) · [`asset participate`](participate.md) · [`chain params`](../chain/params.md) · [Script safety](../../machine-interface.md#script-safety-never-mistake-submitted-for-confirmed)
