# wallet-cli tx approvals

Show permission, signature approvals, current weight, and expiration.

## Synopsis

```
wallet-cli tx approvals (--hex <hex> | --file <path>) [options]
```

## Description

Answers the question every multi-signature workflow keeps asking: **is this transaction ready to
broadcast yet, and if not, who still has to sign?**

Given a partially signed transaction artifact, it decodes the transaction, asks the node which
permission group governs it, and reports:

- what the transaction actually does — contract type, from, to, amount
- which permission group authorizes it, and that group's threshold
- which signers have already approved, and the weight each contributes
- the accumulated weight, the missing weight, and whether the threshold is reached
- when the transaction expires — and whether it already has

Read-only and wallet-independent: it signs nothing, unlocks nothing, and needs no account. `--hex`
and `--file` are mutually exclusive; exactly one is required. Files are read with a size cap of just
over 1 MiB, and must be regular files (not symlinks).

It does need a node (`--network`), because approval state — which signatures count, and for how
much weight — is the chain's answer, not something derivable from the artifact alone.

An **expired** transaction is reported, not rejected: the output flags it and tells you to rebuild,
because collecting further signatures on it would be wasted effort.

## Options

| Option | Description |
|---|---|
| `--hex <string>` | Complete `protocol.Transaction` hex |
| `--file <path>` | Read the transaction hex from a file |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli tx approvals --file partially-signed.hex --network tron:nile
```

```console
Transaction
  TxID        abc123…
  Type        Transfer TRX (TransferContract) — 1 TRX
  From        TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ
  To          TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
  Permission  active "operations" (id 2)  threshold 2
  Expires     2026-07-29 12:34:56 (in 58 minutes)

Progress  1 / 2 — 1 more weight needed
| Approved signer                    | Weight |
| ---------------------------------- | ------ |
| TB6dL8QunEyPUqX95PESxyZ2SHGeAQELW2 |      1 |
```

Once enough weight has accumulated, the progress line says so instead:

```console
Progress  2 / 2 — threshold reached
```

Gate a broadcast on it in a script:

```bash
if wallet-cli tx approvals --file signed.hex --network tron:nile -o json \
   | jq -e '.data.thresholdReached and (.data.expired | not)' >/dev/null; then
  wallet-cli tx broadcast --file signed.hex --network tron:nile
fi
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `txId` | string | Transaction id |
| `contractType` | string | TRON contract type, e.g. `TransferContract` |
| `operation` | string | Human label for that contract type, e.g. `Transfer TRX` |
| `from` / `to` | string | Decoded parties, when the contract type exposes them |
| `rawAmount` | string | Amount in base units, when applicable |
| `tokenContract` | string | Token contract, for token transfers |
| `permission.id` | number | Governing permission group id |
| `permission.name` | string | Group name |
| `permission.threshold` | number | Weight required |
| `currentWeight` | number | Weight accumulated so far |
| `missingWeight` | number | Weight still needed — `0` once reached |
| `thresholdReached` | boolean | Whether it can be broadcast |
| `approved[].address` | string | A signer that has approved |
| `approved[].weight` | number | That signer's weight |
| `signatures` | number | Raw signature count on the artifact |
| `expiration` | number | Expiry, epoch ms |
| `expired` | boolean | Whether it is already past |

`signatures` counts signatures on the artifact; `currentWeight` is what the **node** counts toward
the threshold. They differ when a signature is not from a key in the governing permission — that is
exactly the case worth noticing.

## Exit status

`0` — including when the threshold is *not* reached: the query succeeded, so branch on
`data.thresholdReached`, not on the exit code · `1` execution failure (node unreachable,
undecodable transaction) · `2` usage error (neither/both of `--hex` / `--file`).

## See also

[`tx sign --check`](sign.md) · [`tx broadcast`](broadcast.md) ·
[`tx multisig`](multisig.md) · [`permission show`](../permission/show.md)
