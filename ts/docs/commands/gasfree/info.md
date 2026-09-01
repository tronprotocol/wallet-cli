# wallet-cli gasfree info

Show your GasFree address, activation status, nonce, and fee schedule.

## Synopsis

```
wallet-cli gasfree info [options]
```

## Description

A read-only view, from the provider's API, of the account's GasFree address (deterministically derived), its activation status and current nonce, and the provider's supported tokens with their activation and per-transfer fees (charged in the token itself).

The **GasFree address** is where assets are received and paid — to receive USDT gas-free, give this address to the sender. On the first outgoing transfer the provider activates it on-chain and charges the activation fee. The fee schedule and supported tokens are the provider's live configuration, so the output is whatever the API returns.

Requires the provider API credentials (`gasfreeApiKey` / `gasfreeApiSecret`, set with [`config`](../config.md)).

## Options

No command-specific options; the [global options](../index.md#global-options-every-command) only (`--network`, which selects the service environment, and `--account`).

## Examples

```bash
wallet-cli gasfree info --account main --network tron:3448148188
```

```console
Owner            TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw
GasFree address  TVjsyZ7fYF3qCcNaMxN5PMWmSgYcCyqZfw
Status           active
Nonce            4

| Token | Balance | Activation fee | Transfer fee |
| ----- | ------- | -------------- | ------------ |
| USDT  | 125 USDT | 1 USDT       | 0.5 USDT     |
```

```bash
wallet-cli gasfree info --account main --network tron:3448148188 -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"gasfree.info","data":{"ownerAddress":"TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw","gasFreeAddress":"TVjsyZ7fYF3qCcNaMxN5PMWmSgYcCyqZfw","active":true,"nonce":"4","tokens":[{"symbol":"USDT","address":"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t","decimals":6,"activateFee":"1000000","transferFee":"500000","balance":"125000000"}]},"meta":{"durationMs":380,"warnings":[]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `ownerAddress` | string | The account's own TRON address |
| `gasFreeAddress` | string | Derived GasFree address (receive/pay here) |
| `active` | boolean | Whether the GasFree address is activated on-chain |
| `nonce` | string | Current per-address nonce, as an unsigned decimal string |
| `tokens[]` | array | Supported tokens: `{symbol, address, decimals, activateFee, transferFee, balance}` — fees and balance are decimal strings in the token's base units |

## Exit status

`0` success · `1` execution failure (`gasfree_integrity` — the provider's fee metadata disagreed between the token list and the address response, `provider_error` — service error / rate limit) · `2` usage error (`gasfree_credentials_missing`, `unsupported_network`, `invalid_value`).

## See also

[`gasfree transfer`](transfer.md) · [`gasfree trace`](trace.md) · [`config`](../config.md)
