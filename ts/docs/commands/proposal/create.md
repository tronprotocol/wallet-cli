# wallet-cli proposal create

Create a proposal containing one or more chain-parameter changes.

## Synopsis

```
wallet-cli proposal create --set <name|id>=<value> [--set ...]
                           [--dry-run | --sign-only | --build-only] [options]
```

## Description

Only a registered witness can create a proposal. Parameter names match [`chain params`](../chain/params.md); numeric protocol ids are also accepted. Unknown parameters, non-integers, invalid boolean values, and known out-of-range values fail locally. Duplicate ids use the final assignment and the transaction is ordered by id.

## Options

| Option | Description |
|---|---|
| `--set <name|id>=<value>` | Required, repeatable parameter assignment |
| `--dry-run` | Build and estimate without signing |
| `--sign-only` | Sign without broadcasting |
| `--build-only` | Return the unsigned transaction without accessing a signer |
| `--expiration <ms>` | Transaction expiration in ms, up to `86400000` (24h); only with `--sign-only` or `--build-only`; omitted = node default (~60s) |
| `--permission-id <n>` | Permission group to sign with (0=owner, 1=witness, 2-9=active); default `0` |

Plus `--account`, `--password-stdin`, and the [global options](../index.md#global-options-every-command).

## Example

```bash
echo "$PW" | wallet-cli proposal create --set getCreateAccountFee=200000 --set getTransactionFee=15 --network tron:nile --wait --password-stdin
```

## Output

The receipt contains `kind: "proposal-create"`, proposer, sorted `changes[]`, transaction stage/id, and confirmed resource usage. The proposal id is resolved after confirmation when available.

## Exit status

`0` built/signed/submitted · `1` `not_a_witness`, signer/auth, RPC, or chain rejection · `2` invalid parameter or mode.

## See also

[`proposal approve`](approve.md) · [`chain params`](../chain/params.md)
