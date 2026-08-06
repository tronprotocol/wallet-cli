# wallet-cli gasfree info

Show GasFree address, activation status, nonce, balances, and fees.

## Synopsis

```
wallet-cli gasfree info [options]
```

## Description

Reports everything you need before a [`gasfree transfer`](transfer.md), for the active account (or
`--account`):

- the **GasFree address** derived from your account — a different address from your ordinary TRON
  one, and the address that must actually hold the tokens
- whether it is **active**; an inactive address pays a one-time activation fee on its first transfer
- the current **nonce**, which the signed authorization is bound to
- per supported token: the balance held at the GasFree address, and the current activation and
  transfer fees **denominated in that token**

Read-only: no signing, no unlock, and nothing is submitted. Requires GasFree credentials in
[`config`](../config.md).

Fees are quoted by the provider and change over time — read them here rather than assuming a
constant. The CLI cross-checks the fee metadata from the token list against the address response
and fails with `gasfree_integrity` if they disagree.

## Options

Only the [global options](../index.md#global-options-every-command) (`--account`, `--network`, …).

## Examples

```bash
wallet-cli gasfree info --network tron:nile
```

```console
Owner            TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ
GasFree address  TB6dL8QunEyPUqX95PESxyZ2SHGeAQELW2
Status           active
Nonce            3

| Token | Balance    | Activation fee | Transfer fee |
| ----- | ---------- | -------------- | ------------ |
| USDT  | 125.5 USDT | 1 USDT         | 1 USDT       |
```

`Status  not activated` means the first transfer will additionally deduct the activation fee.

## Output

| Field | Type | Meaning |
|---|---|---|
| `ownerAddress` | string | The selected account's TRON address |
| `gasFreeAddress` | string | Derived GasFree address that holds the tokens |
| `active` | boolean | Whether the GasFree address is activated |
| `nonce` | string | Current authorization nonce |
| `tokens[].symbol` | string | Token symbol |
| `tokens[].address` | string | Token contract address |
| `tokens[].decimals` | number | Token decimals |
| `tokens[].balance` | string | Raw balance at the GasFree address, in base units |
| `tokens[].activateFee` | string | One-time activation fee, in token base units |
| `tokens[].transferFee` | string | Per-transfer service fee, in token base units |

Amounts are raw base-unit strings in JSON; the text renderer applies `decimals`.

## Exit status

`0` · `1` execution failure (`gasfree_integrity`, provider unreachable, missing/invalid
credentials) · `2` usage error (`unsupported_network` on `tron:shasta`).

## See also

[`gasfree transfer`](transfer.md) · [`gasfree trace`](trace.md) · [`config`](../config.md)
