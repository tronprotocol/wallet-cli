# wallet-cli tx sign

Sign a transaction built elsewhere, without broadcasting.

## Synopsis

```
wallet-cli tx sign (--transaction <json> | --hex <hex> | --file <path>) [options]
```

## Description

Signs a transaction that was constructed outside this CLI with the active account's key (or
`--account`) and prints the signed result. JSON input retains the original direct-signing response.
Hex/file input produces a portable protobuf transaction artifact for multi-party signing. Nothing is broadcast — pass the signed payload to
[`tx broadcast`](broadcast.md) when you are ready. `--network` is optional: signing itself is
offline for software accounts.

This is a **pure signer**. It does not check who owns the transaction, what contract it calls, or
how much it moves — the caller decides what to sign; the wallet holds the key, not the policy.

What it does check is **payload integrity**, because a TRON transaction states its content three
times and nothing in the format forces the three to agree:

| Field | Who reads it |
|---|---|
| `raw_data` | you / your agent, when deciding whether to sign |
| `raw_data_hex` | the node, when executing the transaction |
| `txID` | the signature — this hash, and only this hash, is what gets signed |

So a transaction whose `raw_data` reads "1 TRX" can carry the `txID` and `raw_data_hex` of a
1000 TRX transfer, and the signature would be perfectly valid for what actually executes.
`tx sign` therefore refuses (`tx_integrity`) unless:

1. `txID` is the sha256 of `raw_data_hex` — always enforced, for every contract type; and
2. `raw_data` re-encodes to exactly those bytes — enforced wherever the contract type can be
   decoded. A handful of types (`MarketSellAssetContract`, `MarketCancelOrderContract`,
   `ShieldedTransferContract`) cannot be re-encoded; those are still bound by check 1.

Neither check rejects anything a correct transaction builder produces.

Watch-only accounts cannot sign (`watch_only_no_signer`). Ledger accounts sign on the device.

### Multi-sig co-signing

With `--hex` or `--file`, the command decodes the complete protobuf transaction and **appends** its
signature rather than replacing what is there. That is what TRON multi-sig requires — each
permitted key signs the same transaction in turn — so a partially signed transaction can be passed
from signer to signer and broadcast once the permission threshold is met.

This path is offline by default: it verifies transaction integrity, expiration, and append-only
signature behavior locally, but does not claim that the signer belongs to the selected permission
or that the threshold has been reached. Use `--check` when connected to a node to verify those
facts through `getsignweight` and `getapprovedlist`, or inspect the result later with
`wallet-cli tx approvals`.

The JSON compatibility path also preserves existing signatures. `data.signed.signature` may
therefore contain signatures this wallet did not produce. `data.address` always tells you which key
this invocation used, and the text receipt numbers them so you can tell them apart:

```console
✅ Signed transaction
  Address      TU9Z8Ha6Xj9oLLhamrT8MC77dxsj65VYMC
  TxID         d0157b08eb6a5ce9482d4429a481f3bca4a95914f92a6b8f2fb73fb905ff7de0
  Signature 1  ffffffff…                       ← already on the transaction
  Signature 2  16a2ec10…                       ← added by this invocation
```

## Options

| Option | Description |
|---|---|
| `--transaction <string>` | Unsigned transaction JSON (`raw_data`, `raw_data_hex` and `txID` must agree) |
| `--hex <string>` | Complete protobuf `protocol.Transaction` hex |
| `--file <path>` | Read complete transaction hex from a file |
| `--out <path>` | Atomically write the resulting signed hex to a file |
| `--check` | Verify signer permission and resulting approval weight online |
| `--password-stdin` | Master password from stdin (software accounts) |

Plus the [global options](../index.md#global-options-every-command).

The payload is passed on argv, not stdin: it is not a secret, and this leaves fd 0 free for
`--password-stdin`.

## Examples

In the examples, `$PW` is your master password (fed on stdin via `--password-stdin`) and `$TX`
holds the unsigned transaction JSON.

```bash
echo "$PW" | wallet-cli tx sign --transaction "$TX" --password-stdin
```

```console
✅ Signed transaction
  Address    TU9Z8Ha6Xj9oLLhamrT8MC77dxsj65VYMC
  TxID       d0157b08eb6a5ce9482d4429a481f3bca4a95914f92a6b8f2fb73fb905ff7de0
  Signature  16a2ec107591827046bcd77e9ae71a5fc415e2f69b9eebe5ad0fe6e3e39cfed16e7dad3e35bc36031ddd5bc47e22de63a925bf65a82e0e1e69508735bc3fd6271C
```

The signature is printed in full — it is the product of the command and you have to copy it
somewhere. `Fee` is omitted because nothing was estimated: the transaction was built elsewhere.

Sign now, broadcast later:

```bash
echo "$PW" | wallet-cli tx sign --transaction "$TX" --password-stdin -o json \
  | jq -c .data.signed > signed.json
wallet-cli tx broadcast --network tron:nile --tx-stdin < signed.json
```

Append a signature without an approval RPC dependency, then check it from an online machine:

```bash
echo "$PW" | wallet-cli tx sign --file partially-signed.hex \
  --out signed.hex --password-stdin
wallet-cli tx approvals --file signed.hex
```

To check permission membership and approval progress during signing:

```bash
echo "$PW" | wallet-cli tx sign --file partially-signed.hex \
  --check --out signed.hex --password-stdin
```

A transaction whose fields disagree is refused rather than signed:

```console
{"success":false,"command":"tx.sign","error":{"code":"tx_integrity","message":"TRON transaction raw_data does not match its raw_data_hex; refusing to sign"}}
```

## Output

`--transaction` retains the original direct-signing shape:

| Field | Type | Meaning |
|---|---|---|
| `kind` | string | `"sign"` |
| `mode` | string | `"sign-only"` — same shape `tx send --sign-only` emits, so consumers need no branch |
| `address` | string | Address that produced the signature |
| `txId` | string | Transaction id (TRON: `txID`) |
| `signed` | object | The signed transaction — exactly what `tx broadcast` accepts |

No `fee` is reported: nothing was estimated, because the transaction was not built here.

`--hex` and `--file` return the artifact-signing shape:

| Field | Type | Meaning |
|---|---|---|
| `kind` | string | `"tx-sign"` |
| `signer` | string | Address that appended this signature |
| `hex` | string | Complete transaction hex including all signatures |
| `checked` | boolean | Whether online permission/approval verification ran |
| `transaction` | object | Locally decoded transaction summary |
| `signerWeight` | number | Present only when `checked` is true |
| `approval` | object | Present only when `checked` is true; authoritative online approval state |

## Exit status

`0` signed · `1` execution failure (`tx_integrity`, `tx_expired`, `not_authorized`,
`already_signed`, `watch_only_no_signer`, `auth_failed`,
`signing_rejected`) · `2` usage error (missing or malformed `--transaction` → `missing_option` /
`invalid_value`).

## See also

[`tx broadcast`](broadcast.md) · [`typed-data sign`](../typed-data/sign.md) ·
[Security model](../../concepts/security.md)
