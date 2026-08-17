# wallet-cli asset info

Show one TRC10 in full.

## Synopsis

```
wallet-cli asset info (<asset> | --issuer <address>) [options]
```

## Description

Reports a token's issuance record: issuer, total supply, precision, ICO rate and window, frozen tranches, description, URL, and the two free-bandwidth limits. Read-only, no account needed.

Look it up three ways — by id (an all-digit argument), by name, or by `--issuer` address. Exactly one of `<asset>` and `--issuer` is required; giving neither or both is `invalid_value`. Since an account can only ever issue one TRC10, an issuer lookup has a single answer.

Names are not guaranteed unique on chain. **A name that matches several tokens is an error, not a listing** — the command exits `1` with `ambiguous_asset_name` and prints the candidates so you can re-run with an id. See [the example below](#a-name-that-is-not-unique).

Empty sections are dropped entirely: a token with no frozen tranches shows no `Frozen` block at all.

Timestamps here are printed to the second (`2026-08-01 00:00:00 UTC`), not to the minute as elsewhere in the CLI.

This is the TRC10-specific counterpart to [`token info`](../token/info.md), which reports the generic metadata (name, symbol, decimals) shared with TRC20 and selects a TRC10 only by `--asset-id`.

There is no "amount already sold", "remaining supply", or holder count: a node cannot compute any of them reliably — an issuer's plain transfers are indistinguishable from ICO sales when working backwards — so none is reported. For the issuer's current holding, read its balance with [`account balance`](../account/balance.md).

## Options

| Option | Description |
|---|---|
| `<asset>` | Token id or name; an all-digit value is read as the id. One of `<asset>` / `--issuer` |
| `--issuer <address>` | The token issued by this address. One of `<asset>` / `--issuer` |

Plus the [global options](../index.md#global-options-every-command).

## Examples

By id:

```bash
wallet-cli asset info 1000123 --network tron:nile
```

```console
Asset MyToken (id 1000123)
  Issuer            TQkXm4vN...5Zt7Uw
  Total supply      1,000,000,000
  Precision         6
  Price             1 TRX = 100 MyToken
  ICO start time    2026-08-01 00:00:00 UTC
  ICO end time      2026-08-31 00:00:00 UTC
  Url               https://mytoken.io
  Description       Demo TRC10
  Free net/account  0
  Public free net   0
  Frozen (2)
    100,000,000  until 2026-08-31 00:00:00 UTC
    50,000,000   until 2026-10-30 00:00:00 UTC
```

### A name that is not unique

```bash
wallet-cli asset info MyToken --network tron:nile
```

The command fails with exit `1`; the message and the candidate table go to **stderr**:

```console
error [ambiguous_asset_name]: 2 TRC10 tokens are named MyToken; re-run with the id
| ID      | Issuer                             | Total supply  | Precision |
| ------- | ---------------------------------- | ------------- | --------- |
| 1000123 | TQkXm4vN2f8LrQ5tYc7bWmXe3sVd9Zt7Uw | 1,000,000,000 | 6         |
| 1000488 | TZx9kP2mR4nJ6vLc8dHqYe1tWbXs5f7bWq | 50,000,000    | 2         |
```

In json the same information is in `error.details` — see [Output](#output).

By issuer — someone else's token here, and it has no frozen tranches:

```bash
wallet-cli asset info --issuer TZx9kP2m...7bWq --network tron:nile
```

```console
Asset MyToken (id 1000488)
  Issuer            TZx9kP2m...7bWq
  Total supply      50,000,000
  Precision         2
  Price             1 TRX = 5 MyToken
  ICO start time    2026-07-15 00:00:00 UTC
  ICO end time      2026-09-15 00:00:00 UTC
  Url               https://beta.example
  Description       Another TRC10
  Free net/account  0
  Public free net   0
```

```bash
wallet-cli asset info 1000123 --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"asset.info","data":{"kind":"asset-info","assetId":"1000123","name":"MyToken","abbr":"MTK","issuerAddress":"TQkXm4vN...","totalSupply":"1000000000000000","precision":6,"price":"1:100","trxNum":1000000,"num":100000000,"startTime":1785542400000,"endTime":1788134400000,"url":"https://mytoken.io","description":"Demo TRC10","freeAssetNetLimit":0,"publicFreeAssetNetLimit":0,"frozenSupply":[{"amount":"100000000000000","days":30,"expireTime":1788134400000},{"amount":"50000000000000","days":90,"expireTime":1793318400000}]},"meta":{"durationMs":26,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

The ambiguous-name failure, in json:

```bash
wallet-cli asset info MyToken --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":false,"command":"asset.info","error":{"code":"ambiguous_asset_name","message":"2 TRC10 tokens are named MyToken; re-run with the id","details":{"name":"MyToken","assetIds":["1000123","1000488"],"matches":[{"assetId":"1000123","issuerAddress":"TQkXm4vN...","totalSupply":"1000000000000000","precision":6},{"assetId":"1000488","issuerAddress":"TZx9kP2m...","totalSupply":"5000000000","precision":2}]}},"meta":{"durationMs":29,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data.kind` is `asset-info`.

| Field | Type | Meaning |
|---|---|---|
| `assetId` | string | Token id |
| `name` / `abbr` | string | Name and abbreviation as issued. `abbr` is json-only — text has no row for it |
| `issuerAddress` | string | Issuer, base58 |
| `totalSupply` | string | Total supply, raw (whole tokens × 10^`precision`). A **string**: supplies reach int64 and would lose precision as a JSON number |
| `precision` | number | Decimal places, 0–6 |
| `price` | string | The issued rate as `trx:tokens`, in whole units — what text renders as `1 TRX = 100 MyToken` |
| `trxNum` / `num` | number | The same rate exactly as stored on chain, in sun and minimal units. For a `precision` of 6, `1:100` is stored as `1000000` / `100000000` |
| `startTime` / `endTime` | number | ICO window, ms since epoch |
| `url` / `description` | string | Project page and description |
| `freeAssetNetLimit` / `publicFreeAssetNetLimit` | number | Free bandwidth per holder, and the shared pool |
| `frozenSupply[]` | array | `amount` (raw, a **string**), `days`, `expireTime` (ms since epoch). An empty array when there are none |

There is no `remainingSupply` field.

A name matching several tokens fails instead of returning data. `error.details` then carries `name`, `assetIds[]` (the ids to re-run with), and `matches[]` — one flat row per candidate with `assetId`, `issuerAddress`, `totalSupply` (raw, string), and `precision`. Text mode renders `matches[]` as the table shown above, scaling each `totalSupply` by its `precision`.

## Exit status

`0` success · `1` execution failure (`asset_not_found` — no such token, `ambiguous_asset_name` — the name matches several tokens, `rpc_error`) · `2` usage error (`invalid_value` — neither `<asset>` nor `--issuer` given, or both; or `--issuer` is not a valid base58 TRON address).

## See also

[`asset list`](list.md) · [`token info`](../token/info.md) · [`asset participate`](participate.md)
