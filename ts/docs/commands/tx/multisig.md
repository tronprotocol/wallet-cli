# wallet-cli tx multisig

Coordinate multi-signature collection through the TronLink service. ✍️

## Synopsis

```
wallet-cli tx multisig                                  # list
wallet-cli tx multisig --create (--hex <hex> | --file <path>)
wallet-cli tx multisig --sign <txId>
wallet-cli tx multisig --watch
```

## Description

Collecting signatures is a coordination problem, not a cryptographic one: the transaction has to
reach each co-signer, and someone has to know when enough weight has accumulated. The offline path
([`tx sign --file`](sign.md) → hand the file on → [`tx approvals`](approvals.md)) solves it by
passing an artifact around by hand.

This command uses the official TronLink multi-sign service as a shared inbox instead: one signer
uploads the unsigned transaction, the others fetch, sign, and submit it, and the service holds the
accumulated signatures in between. TronLink wallet users see the same queue.

The mode flags `--create`, `--sign`, and `--watch` are mutually exclusive; with none of them the
command lists.

**The service is a transport, not an authority.** Everything it returns is treated as untrusted:
the CLI re-derives the transaction hash from the raw data, checks the reported contract type,
owner, weights, and signature progress against the transaction itself, and fails with
`provider_error` on any disagreement — rather than showing you what the service claims. Signing
still happens locally with your key.

### Modes

**list** (no flag) — service-managed transactions for the selected account, with each one's state,
accumulated weight against the threshold, and whether it is waiting on *you*.

**`--create`** — upload one **unsigned** transaction and open a collection. Passing an
already-signed transaction is refused (`invalid_value`), as is an expired one (`tx_expired`) or one
whose permission does not include the selected account (`not_authorized`). Requires exactly one of
`--hex` / `--file`, which are valid only with `--create`.

**`--sign <txId>`** — fetch the transaction with the signatures gathered so far, verify it locally,
sign it with your key, and submit the result back. Fails with `already_signed` if this account has
already contributed, `tx_expired` if it has lapsed, or `not_authorized` if the account is not one
of its signers. Once the threshold is reached, the output tells you the broadcast command.

**`--watch`** — hold a WebSocket open and report when transactions are awaiting your signature.
By design it receives **only a count**, never transaction content, so watching leaks nothing about
what is queued. Runs until interrupted (Ctrl-C, SIGINT/SIGTERM), then reports how many
notifications arrived.

## Configuration

Requires TronLink service credentials in [`config`](../config.md):

```bash
wallet-cli config tronlinkSecretId <id>
wallet-cli config tronlinkSecretKey <key>
wallet-cli config tronlinkChannel <channel>
```

`tronlinkSecretKey` is masked on read (`********`). The service endpoint comes from the network
descriptor — `api.walletadapter.org` for mainnet, and the Nile and Shasta equivalents.

## Options

| Option | Description |
|---|---|
| `--create` | Upload one unsigned transaction and open a signature collection |
| `--hex <string>` | Unsigned `protocol.Transaction` hex — only with `--create` |
| `--file <path>` | File containing the unsigned transaction hex — only with `--create` |
| `--sign <txId>` | Fetch and co-sign one pending transaction by 32-byte hex txId |
| `--watch` | Keep a WebSocket open and report the count of transactions awaiting this account |
| `--password-stdin` | Master password from stdin (software accounts) |

Plus the [global options](../index.md#global-options-every-command).

## Examples

Open a collection from an unsigned transaction:

```bash
wallet-cli tx multisig --create --file tx.unsigned.hex --network tron:nile
```

```console
✅ Created on TronLink multi-sig service
  TxID  9c1f…

Transaction
  TxID        9c1f…
  Type        Transfer TRX (TransferContract) — 1 TRX
  Permission  active "operations" (id 2)  threshold 2
  Expires     2026-07-29 12:34:56 (in 58 minutes)

Progress  0 / 2 — 2 more weight needed
No approved signers.
! Each signer signs it with: wallet-cli tx multisig --sign 9c1f…
```

See what is waiting on you:

```bash
wallet-cli tx multisig --network tron:nile
```

```console
Multi-sig transactions — TronLink service (1 total)
| TxID  | Type              | Amount | State        | Progress | Expires                       |
| ----- | ----------------- | ------ | ------------ | -------- | ----------------------------- |
| 9c1f… | TransferContract  | 1 TRX  | awaiting you | 1 / 2    | 2026-07-29 12:34:56 (in 58m)  |
! Co-sign one with: wallet-cli tx multisig --sign <txId>
```

Co-sign it:

```bash
echo "$PW" | wallet-cli tx multisig --sign 9c1f… --network tron:nile --password-stdin
```

When your signature completes the threshold, the receipt ends with the broadcast command:

```console
! Broadcast it: wallet-cli tx broadcast --hex 0a02…
```

Watch for work, count only:

```bash
wallet-cli tx multisig --watch --network tron:nile
```

```console
Watching TronLink multi-sig service for tron:nile … (Ctrl-C to stop)
🔔 You have 1 transaction(s) to sign — view them with: wallet-cli tx multisig
```

## Output

`data` is discriminated — by `transactions` for the list, and by `action` otherwise.

**list**

| Field | Type | Meaning |
|---|---|---|
| `address` | string | Account the queue was read for |
| `total` | number | Number of transactions |
| `transactions[].txId` | string | Transaction id |
| `transactions[].state` | string | `pending` \| `signed` \| `success` \| `failed` |
| `transactions[].contractType` | string | TRON contract type |
| `transactions[].originator` / `owner` | string | Who created it / whose account it acts on |
| `transactions[].permission` | object | `id`, `name`, `threshold` |
| `transactions[].currentWeight` / `missingWeight` / `thresholdReached` | — | Approval progress |
| `transactions[].awaitingMySignature` | boolean | Whether it is waiting on the selected account |
| `transactions[].signedByCurrentAccount` | boolean | Whether this account already signed |
| `transactions[].signatureProgress[]` | array | Per signer: `address`, `weight`, `signed`, `signedAt` |
| `transactions[].createdAt` / `expiration` / `expired` | — | Timing |

**`--create`** — `action: "create"`, `accepted`, `hex`, and `transaction` (the same approval object
[`tx approvals`](approvals.md) returns).

**`--sign`** — `action: "sign"`, `accepted`, `signer`, `signerWeight`, `hex`, and `transaction`.

**`--watch`** — `action: "watch"`, `address`, `notifications`.

## Exit status

`0` · `1` execution failure — `not_authorized`, `already_signed`, `tx_expired`, `not_found`,
`provider_error` (any inconsistency in what the service returned), `auth_failed` · `2` usage error —
conflicting mode flags, `--hex`/`--file` without `--create`, `--create` without exactly one of
them, a malformed txId.

## See also

[`tx sign`](sign.md) — the offline, file-passing alternative · [`tx approvals`](approvals.md) ·
[`tx broadcast`](broadcast.md) · [`permission show`](../permission/show.md)
