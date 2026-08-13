# wallet-cli asset unfreeze

Release matured frozen supply of the TRC10 you issued.

## Synopsis

```
wallet-cli asset unfreeze
                 [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]] [--permission-id <n>] [options]
```

## Description

Releases the part of your token's supply that you locked at issuance and whose lock period has now elapsed. Released tokens return to the issuing account's balance.

**Not to be confused with [`stake unfreeze`](../stake/unfreeze.md)**, which releases staked *TRX* in exchange for resources. This one releases frozen *TRC10 supply*. Different mechanism, different asset — they share only a verb.

There are **no arguments**. It always targets the token issued by the signing account, and the chain releases **every matured tranche at once** — you cannot choose a tranche or a partial amount. Tranches that have not matured are untouched; run the command again later for those.

A tranche's unlock time is fixed at issuance as `start_time + days`, computed from the ICO start rather than from when the issuance actually landed. [`asset info`](info.md) shows each tranche with its unlock time.

**By default the command returns at submission**; `--wait` blocks until confirmed. The released amount is read from the transaction receipt, so it is exact only once confirmed; without `--wait` the response reports the amount we projected from the tranche table.

**Ledger accounts are refused** (`ledger_unsupported`): the Ledger TRON app cannot decode `UnfreezeAssetContract`.

## Options

| Option | Description |
|---|---|
| `--dry-run` | Estimate only, no signature/broadcast; excludes `--sign-only` / `--build-only` |
| `--sign-only` | Sign without broadcasting, output the signed hex; excludes `--dry-run` / `--build-only`; pairs with `--expiration` |
| `--build-only` | Build only, output the **unsigned** hex; excludes `--dry-run` / `--sign-only`; pairs with `--expiration` |
| `--expiration <ms>` | Transaction expiration in ms, up to `86400000` (24h); only with `--sign-only` or `--build-only`; omitted = node default (~60s) |
| `--permission-id <n>` | Permission group to sign with (0=owner, 1=witness, 2-9=active); default `0` |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--password-stdin` | Master password from stdin |

Plus the [global options](../index.md#global-options-every-command).

## Examples

Check what has matured before spending bandwidth:

```bash
wallet-cli asset info --issuer TQkXm4vN...5Zt7Uw --network tron:nile
```

Release everything that has matured:

```bash
echo "$PW" | wallet-cli asset unfreeze --wait --password-stdin --network tron:nile
```

## Errors

| Code | Meaning |
|---|---|
| `not_an_issuer` | This account has not issued a TRC10 |
| `no_frozen_supply` | The token was issued without any frozen tranche |
| `not_yet_unfreezable` | No tranche has matured yet; the message names the earliest unlock |
| `ledger_unsupported` | The account is Ledger-backed; use a software account |
| `watch_only_no_signer` | The account cannot sign |
| `transaction_rejected` | The node refused it — the message carries its reason |

## See also

[`asset info`](info.md) · [`asset issue`](issue.md) · [`stake unfreeze`](../stake/unfreeze.md) (a different thing) · [`asset` group](index.md)
