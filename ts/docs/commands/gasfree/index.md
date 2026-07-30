# wallet-cli gasfree

Transfer tokens without holding any TRX, via the GasFree Open Platform.

## Synopsis

```
wallet-cli gasfree COMMAND
```

## Subcommands

| Command | Description | Broadcasts |
|---|---|---|
| [`gasfree info`](info.md) | Show GasFree address, activation status, nonce, balances, and fees | no |
| [`gasfree transfer`](transfer.md) | Sign and submit a TIP-712 GasFree token transfer | ✍️ yes |
| [`gasfree trace`](trace.md) | Track a GasFree transfer by provider trace id | no |

## What GasFree is

Normally a TRC20 transfer costs TRX — you need bandwidth and energy, so an account holding only
USDT cannot move it. GasFree removes that requirement: instead of broadcasting a transaction, you
**sign a TIP-712 `PermitTransfer` authorization** and hand it to a service provider, who broadcasts
on your behalf and takes their fee **in the token being transferred**.

So the flow is not "send a transaction" but "sign an intent, then track it":

```
gasfree transfer ──sign PermitTransfer──> provider accepts (traceId)
                                                │
                          WAITING → INPROGRESS → CONFIRMING → SUCCEED | FAILED
                                                │
                                        gasfree trace <traceId>
```

Your **GasFree address** is a distinct, deterministic address derived from your account — it is
*not* your normal TRON address. Tokens must be in the GasFree address to be transferable this way;
see [`gasfree info`](info.md).

## Configuration

GasFree requires Open Platform credentials, stored via [`config`](../config.md):

```bash
wallet-cli config gasfreeApiKey <key>
wallet-cli config gasfreeApiSecret <secret>
```

The secret is never echoed back — reading it returns `********`.

Endpoint and TIP-712 domain come from the network descriptor, not from your config:

| Network | GasFree endpoint | Supported |
|---|---|---|
| `tron:mainnet` | `https://open.gasfree.io` | yes |
| `tron:nile` | `https://open-test.gasfree.io` | yes |
| `tron:shasta` | — | **no** — `unsupported_network` |

## Integrity checks

Provider responses are untrusted input, and the CLI validates rather than displays them. It fails
with `gasfree_integrity` if the provider reports an owner that is not the selected account, if
token and address fee metadata disagree, if fee arithmetic does not add up, or if a trace names a
token outside the current configuration. Signing likewise fails (`signing_rejected`) unless the
signed digest is exactly the expected `PermitTransfer` and recovers to the selected account.

## See also

[`tx send`](../tx/send.md) — the ordinary, TRX-paying transfer ·
[`token balance`](../token/balance.md) · [`config`](../config.md)
