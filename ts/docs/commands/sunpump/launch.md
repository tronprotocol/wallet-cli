# wallet-cli sunpump launch

Create a new token on SunPump's bonding curve.

## Synopsis

```
wallet-cli sunpump launch --name <name> --symbol <symbol> --description <text>
                          [--image <path> | --image-base64 <base64>]
                          [--twitter-url <url>] [--telegram-url <url>] [--website-url <url>]
                          [--dry-run]
```

## Description

**The new token is not owned by you.** SunPump creates it server-side and chooses its creator — the token's `owner` — itself. That is not your active account, nor any account in this wallet. You pay no fee, you sign nothing, and the token is not yours to move: afterwards you trade it on the curve with [`sunpump buy`](buy.md) and [`sunpump sell`](sell.md), exactly like anyone else's SunPump token.

Nothing is signed locally, so the command resolves no account and takes no `--account` and no password. There is no transaction of this CLI's making — the receipt's `createTxHash` is the service's, and whether it is on chain yet is a question for [`tx info`](../tx/info.md).

The token starts in status `CREATED`, on the curve. It moves to SunSwap only once the curve fills; the command's name is the service's, and the receipt says what actually happened.

**The service judges the name and the symbol, not this CLI.** A name it will not take, or a symbol already in use, comes back as `provider_error` with the service's own message. Nothing is checked locally that the service would accept.

**A launch is real and permanent.** There is no undo and no testnet: the group is mainnet only. Use `--dry-run` first.

`--dry-run` sends nothing to the create endpoint. It validates the options, reads the logo file, and prints the request that would be made. Because the creator is not known until the service picks one, the preview shows the fact instead of an address.

## Options

| Option | Description |
|---|---|
| `--name <name>` | **Required.** Token name |
| `--symbol <symbol>` | **Required.** Token symbol |
| `--description <text>` | **Required.** Token description |
| `--image <path>` | A logo image file, read and sent as base64. A missing file is `file_not_found` (exit 2) |
| `--image-base64 <base64>` | The logo as a base64 string. Excludes `--image` |
| `--twitter-url <url>` | Twitter URL; must start with `http://` or `https://` |
| `--telegram-url <url>` | Telegram URL; must start with `http://` or `https://` |
| `--website-url <url>` | Website URL; must start with `http://` or `https://` |
| `--dry-run` | Validate and preview without sending |

A logo is optional; without one the token is created without one, and the dry run says so. An option left out is omitted from the request, not sent empty.

Plus the [global options](../index.md#global-options-every-command). No `--account`, `--wait` or `--wait-timeout`: nothing is signed locally and no transaction comes back to wait for, so they are refused with `invalid_option`.

## Examples

Creating a token with a logo and a website. Note the `Creator`: the address SunPump chose, not the local account:

```bash
wallet-cli sunpump launch --name "My Token" --symbol MYT --description "a demo token" \
  --image logo.png --website-url https://example.com --network tron
```

```console
✅ SunPump token created
  Name         My Token
  Symbol       MYT
  Address      TXQiBB5nCC7cewZ13pX6dwoHWxPZ2wK2Yz
  Creator      TRYeDrXweRdBorzH9XE8KWMq3TinW4fmjd
  Status       CREATED
  Created      2026-10-08 06:12 UTC
  Create tx    d06b9e3f5a2c8d17e4b0f6a9c3d5e82b1f7a4c0d9e6b3f2a8c5d1e7b4f0a9c36
  Logo         https://cdn.sunpump.meme/public/logo/MYT_TRYeDr_Qm7vK2pXn4Ls.png
  Website      https://example.com
  Description  a demo token
```

```bash
wallet-cli sunpump launch --name "My Token" --symbol MYT --description "a demo token" \
  --image logo.png --website-url https://example.com --network tron -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"sunpump.launch","data":{"kind":"sunpump-launch","token":{"address":"TXQiBB5nCC7cewZ13pX6dwoHWxPZ2wK2Yz","symbol":"MYT","name":"My Token","decimals":18,"totalSupply":"1000000000000000000000000000","status":"CREATED","owner":"TRYeDrXweRdBorzH9XE8KWMq3TinW4fmjd","market":{"marketCapUsd":"10982.080555299140726256","priceInTrx":"0.000032710280373832","priceChange24HrPercent":"0","volume24HrSun":"0","virtualLiquidity":"23501.65238834","trxPriceInUsd":"0.334866785815","priceUsd":"0.000010953586451892"},"curve":{"pumpPercentage":"0","currentSold":"0","tokenReserve":"800000000000000000000000000","trxReserve":"0"},"createdAt":"2026-10-08 06:12","createTxHash":"d06b9e3f5a2c8d17e4b0f6a9c3d5e82b1f7a4c0d9e6b3f2a8c5d1e7b4f0a9c36","description":"a demo token","links":{"logo":"https://cdn.sunpump.meme/public/logo/MYT_TRYeDr_Qm7vK2pXn4Ls.png","website":"https://example.com"}}},"meta":{"durationMs":3916,"warnings":[]},"chain":{"family":"tron","network":"tron:728126428","chainId":"728126428"}}
```

The token can be read back with [`sunpump token-info`](token-info.md), which shows the same creator.

## Output

`kind` is `sunpump-launch`.

- **Dry run** (`mode: "dry-run"`): `name`, `symbol`, `description`, and where given `image` — `{source: "file", path, bytes}` or `{source: "base64", chars}` — and `links` (`website`, `twitter`, `telegram`). Exactly the fields the request would carry.
- **Created**: `token`, the same record [`sunpump token-info`](token-info.md) returns. **`token.owner` is the creator SunPump chose, not your account.** `createdAt` is UTC; `createTxHash` is the service's transaction.

## Exit status

`0` success · `1` execution failure (`provider_error` — including a name or symbol the service refused; `provider_rate_limited`; `timeout`) · `2` usage error (`missing_option`; `invalid_option` — `--account`, `--wait`, or both `--image` and `--image-base64`; `file_not_found`; `invalid_value` — a URL that does not start with `http://` or `https://`, or an image file that cannot be read; `unsupported_network_capability` off mainnet; `family_mismatch` on an EVM network).

## See also

[`sunpump token-info`](token-info.md) · [`sunpump buy`](buy.md) · [`sunpump sell`](sell.md) · [`sunpump` group](index.md)
