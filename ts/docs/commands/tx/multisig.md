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

This command uses the official TronLink multi-sign service as a shared inbox instead: the
originator signs the transaction and submits it, which opens the collection; the others fetch, sign,
and submit it in turn, and the service holds the accumulated signatures in between. TronLink wallet
users see the same queue.

The mode flags `--create`, `--sign`, and `--watch` are mutually exclusive; with none of them the
command lists.

**The service is a transport, not an authority.** Everything it returns is treated as untrusted:
the CLI re-derives the transaction hash from the raw data, and checks the reported contract type,
owner, weights, and signature progress against the transaction itself **and against the on-chain
permission** — rather than showing you what the service claims. Signing still happens locally with
your key.

Byte-level lies are fatal: a record whose hash, contract type, or owner does not match its own
`raw_data` fails the command with `provider_error`, because no passage of time can produce one.

Disagreement with the *chain* is different, because permissions change while old transactions sit
in the queue. Listing preserves the service's historical state, marks the independent validation
column **unverified**, and shows the rest of the page. The JSON result retains the detailed
`unverifiedReason`. `awaitingMySignature` is forced to `false` so the record cannot be mistaken for
work waiting on you. Acting on one still refuses: [`--sign`](#modes) re-runs the same check and fails
with `provider_error` or `not_authorized`.

Concretely, for the signer roster: every address the service reports must be a key in the
transaction's on-chain permission, and each `weight` shown is read from the chain, never from the
service — so a reported weight that has gone stale is corrected rather than displayed. A roster that
omits a key is accepted: every figure you act on (`threshold`, `currentWeight`, `missingWeight`) is
chain-derived regardless.

### Modes

**list** (no flag) — service-managed transactions for the selected account, with each one's state,
accumulated weight against the threshold, and whether it is waiting on *you*.

**`--create`** — take one **unsigned** transaction, sign it with your key, and submit it. There is
no empty collection: the service derives the starting weight from the signature the transaction
arrives with, so opening a collection and casting its first signature are the same act — the
originator does not sign again afterwards. Passing an already-signed transaction is refused
(`invalid_value`), as is an expired one (`tx_expired`) or one whose permission does not include the
selected account (`not_authorized`). Requires exactly one of `--hex` / `--file`, which are valid
only with `--create`, and the master password.

**`--sign <txId>`** — fetch the transaction with the signatures gathered so far, verify it locally,
sign it with your key, and submit the result back. Fails with `already_signed` if this account has
already contributed, `tx_expired` if it has lapsed, or `not_authorized` if the account is not one
of its signers. Once the threshold is reached the service broadcasts the transaction itself, so the
output tells you how to confirm that before broadcasting it yourself.

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
| `--create` | Sign one unsigned transaction and open a signature collection with it |
| `--hex <string>` | Unsigned `protocol.Transaction` hex — only with `--create` |
| `--file <path>` | File containing the unsigned transaction hex — only with `--create` |
| `--sign <txId>` | Fetch and co-sign one pending transaction by 32-byte hex txId |
| `--watch` | Keep a WebSocket open and report the count of transactions awaiting this account |
| `--password-stdin` | Master password from stdin (software accounts) |

Plus the [global options](../index.md#global-options-every-command).

## Examples

Open a collection from an unsigned transaction — built by any broadcasting command with
`--build-only`:

```bash
echo "$PW" | wallet-cli tx multisig --create --file tx.unsigned.hex --network tron:nile --password-stdin
```

```console
✅ Created on TronLink multi-sig service
  Signer  TMSg…ToHJ  (weight 1)
  Hex     0a02…9f31

Transaction
  TxID        9c1f…
  Type        Transfer TRX (TransferContract) — 1 TRX
  Permission  active "operations" (id 2)  threshold 2
  Expires     2026-07-29 12:34:56 (in 58 minutes)

Progress  1 / 2 — 1 more weight needed
| Approved signer                    | Weight |
| ---------------------------------- | ------ |
| TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ | 1      |
! Each co-signer signs it with: wallet-cli tx multisig --sign 9c1f…
```

See what is waiting on you:

```bash
wallet-cli tx multisig --network tron:nile
```

```console
Multi-sig transactions — TronLink service (2 total)
| TxID  | Type              | Amount | State        | Validation | Progress | Expires                       |
| ----- | ----------------- | ------ | ------------ | ---------- | -------- | ----------------------------- |
| 9c1f… | TransferContract  | 1 TRX  | awaiting you | verified   | 1 / 2    | 2026-07-29 12:34:56 (in 58m)  |
| 1a9b… | TransferContract  | 1 TRX  | success      | unverified | 1 / 1    | 2026-04-29 12:33 (~97d ago)   |
! Co-sign one with: wallet-cli tx multisig --sign <txId>
```

The second row is an old transaction whose permission has since been changed, so its numbers can no
longer be reconciled with the chain. It stays visible and labelled; the page does not fail.

Co-sign it:

```bash
echo "$PW" | wallet-cli tx multisig --sign 9c1f… --network tron:nile --password-stdin
```

When your signature completes the threshold, the service broadcasts the transaction itself, so the
receipt points you at the confirmation first:

```console
! Threshold reached — the service broadcasts it. Confirm: wallet-cli tx info --txid 9c1f…
  Not on chain: wallet-cli tx broadcast --hex 0a02…
```

Broadcasting one that is already on chain fails with `transaction_rejected`
(`Transaction already exists.`) — harmless, but confirm rather than guess.

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
| `transactions[].verified` | boolean | Whether the record reconciled with the chain |
| `transactions[].unverifiedReason` | string? | Present only when `verified` is `false` |
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

**`--create`** — `action: "create"`, `accepted`, `signer`, `signerWeight`, `hex` (the signed
transaction), and `transaction` (the same approval object [`tx approvals`](approvals.md) returns).

**`--sign`** — `action: "sign"`, `accepted`, `signer`, `signerWeight`, `hex`, and `transaction`.

**`--watch`** — `action: "watch"`, `address`, `notifications`.

## Exit status

`0` · `1` execution failure — `not_authorized`, `already_signed`, `tx_expired`, `not_found`,
`provider_error` (a record inconsistent with its own bytes, or a rejection from the service — whose
own wording is carried through as `error.details.providerMessage`), `auth_failed` · `2` usage error —
conflicting mode flags, `--hex`/`--file` without `--create`, `--create` without exactly one of
them, a malformed txId.

## See also

[`tx sign`](sign.md) — the offline, file-passing alternative · [`tx approvals`](approvals.md) ·
[`tx broadcast`](broadcast.md) · [`permission show`](../permission/show.md)
