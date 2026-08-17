# wallet-cli tx multisig

Multi-sig collaboration via the TronLink multi-sig service.

> `tx multisig` works only through the external TronLink multi-sig service and needs credentials (`tronlinkSecretId` / `tronlinkSecretKey` / `tronlinkChannel`). It is an optional convenience layer — the on-chain path ([`tx sign`](sign.md) / [`tx approvals`](approvals.md) / [`tx broadcast`](broadcast.md)) does the same job without any service. Without credentials the command is unusable (`tronlink_credentials_missing`).

## Synopsis

```
wallet-cli tx multisig [--create (--hex <unsigned-hex> | --file <path>) | --sign <txId> | --watch]
                       [options]
```

## Description

Where the on-chain path passes a hex from person to person, the service path has the TronLink service **hold** a transaction, **accumulate** signatures one by one, and **push** notifications to co-signers over a WebSocket. The command has four mutually exclusive modes:

- **default (no mode flag)** — list the service's multi-sig transactions involving this account, with their progress. This is the everyday way to find what's awaiting you.
- **`--create`** — sign an **unsigned** transaction locally and submit it, which opens the collection. The input is unsigned hex, produced by any broadcast command in `--build-only` mode (e.g. `tx send … --build-only`). Requires the master password.
- **`--sign <txId>`** — co-sign one: fetch it with the signatures gathered so far, sign locally, and submit the whole transaction back for the service to accumulate. Requires the master password.
- **`--watch`** — keep a WebSocket open and nudge you with the **count** of transactions awaiting your signature (no details); list them with the default mode to act.

### Opening a collection is your first signature

There is no empty collection. The service derives the starting weight from the signature the transaction arrives with, so `--create` signs before it submits and the collection opens at `1 / N` — the originator does **not** sign again afterwards, and attempting it returns `already_signed`.

`--create` refuses a transaction that already carries a signature (`invalid_value`), one that has expired (`tx_expired`), and one whose permission group does not include the selected account (`not_authorized`).

### Reaching the threshold

Once the accumulated weight reaches the threshold the **service broadcasts the transaction itself**. The `--sign` receipt therefore points at confirmation first, and offers a manual broadcast only as a fallback. Broadcasting one that is already on chain fails with `transaction_rejected` (`Transaction already exists.`) — harmless, but confirm rather than guess. A transaction with more than one signature also incurs a 1 TRX multi-sig fee.

`--watch` receives only a count, never transaction content, so watching leaks nothing about what is queued. It runs until interrupted (Ctrl-C, SIGINT/SIGTERM), then reports how many notifications arrived.

The credentials are per-environment (mainnet / testnet); set them with [`config`](../config.md). The service owns its data; this command keeps no local copy.

## Options

| Option | Description |
|---|---|
| `--create` | Sign the `--hex` / `--file` **unsigned** transaction and open a collection with it; excludes `--sign` / `--watch` |
| `--hex <unsigned-hex>` / `--file <path>` | The unsigned transaction (one of, only with `--create`) |
| `--sign <txId>` | Co-sign a pending transaction by 32-byte hex txId: fetch → sign locally → submit back; excludes `--create` / `--watch` |
| `--watch` | Keep a WebSocket open; nudge with the count awaiting your signature (no details); excludes `--create` / `--sign` |

Plus the [global options](../index.md#global-options-every-command) and `--password-stdin` (with `--create` and `--sign`).

## Examples

In the examples, `$PW` is your master password, fed on stdin via `--password-stdin`.

The initiator builds an **unsigned** transaction (`--build-only`, expiry extended to allow collection), then signs and submits it to open a collection:

```bash
# --build-only does not sign and needs no master password
wallet-cli tx send --to TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub --amount 1000 --permission-id 2 --build-only --expiration 86400000 --network tron:nile > tx.unsigned.hex
```

```bash
echo "$PW" | wallet-cli tx multisig --create --file tx.unsigned.hex --network tron:nile --password-stdin
```

```console
✅ Created on TronLink multi-sig service
  Signer   TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw  (weight 1)
  Hex      0a02...9f31

Transaction
  TxID        9c1...
  Type        Transfer TRX — 1,000 TRX
  From        TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw
  To          TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub
  Permission  active "finance" (id 2)  threshold 2
  Expires     2026-07-14 15:32 (~23h)

Progress  1 / 2 — 1 more weight needed
| Approved signer                    | Weight |
| ---------------------------------- | ------ |
| TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw  |      1 |
! Each co-signer signs it with: wallet-cli tx multisig --sign 9c1...
```

A co-signer lists what's awaiting them (default mode), then co-signs:

```bash
wallet-cli tx multisig --account cosigner --network tron:nile
```

```console
Multi-sig transactions — TronLink service (1 total)
| TxID   | Type         | Amount    | State        | Progress | Expires          |
| ------ | ------------ | --------- | ------------ | -------- | ---------------- |
| 9c1... | Transfer TRX | 1,000 TRX | awaiting you | 1 / 2    | 2026-07-14 15:32 |
! Co-sign it: wallet-cli tx multisig --sign 9c1...
```

```bash
echo "$PW" | wallet-cli tx multisig --sign 9c1... --account cosigner --network tron:nile --password-stdin
```

```console
✅ Signed & submitted
  Signer   TXe4Kd8nP2rF9gH5jL3mV6cW1bN7yS0aQz  (weight 1)
  Hex      0a02...9f31

Transaction
  TxID        9c1...
  Type        Transfer TRX — 1,000 TRX
  From        TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw
  To          TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub
  Permission  active "finance" (id 2)  threshold 2
  Expires     2026-07-14 15:32 (~22h)

Progress  2 / 2 — threshold reached
| Approved signer                    | Weight |
| ---------------------------------- | ------ |
| TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw  |      1 |
| TXe4Kd8nP2rF9gH5jL3mV6cW1bN7yS0aQz  |      1 |
! Threshold reached — the service broadcasts it. Confirm: wallet-cli tx info --txid 9c1...
  Not on chain: wallet-cli tx broadcast --hex 0a02...
```

The list mode as JSON:

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"tx.multisig","data":{"address":"TXe4Kd8nP2rF9gH5jL3mV6cW1bN7yS0aQz","total":1,"unreadable":0,"transactions":[{"txId":"9c1...","state":"pending","verified":true,"contractType":"TransferContract","operation":"Transfer TRX","rawAmount":"1000000000","originator":"TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw","owner":"TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw","permission":{"id":2,"name":"finance","threshold":2},"currentWeight":1,"missingWeight":1,"thresholdReached":false,"awaitingMySignature":true,"signedByCurrentAccount":false,"expiration":1784388720000}]},"meta":{"durationMs":420,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

Optionally, a WebSocket nudge (count only — list them to see details):

```bash
wallet-cli tx multisig --watch --account cosigner --network tron:nile
```

```console
Watching TronLink multi-sig service for tron:nile … (Ctrl-C to stop)
🔔 You have 1 transaction(s) to sign — view them with: wallet-cli tx multisig
```

## Output

`data` is discriminated by `transactions` for the list, and by `action` otherwise.

**default (list)**

| Field | Type | Meaning |
|---|---|---|
| `address` | string | Account the queue was read for |
| `total` | number | Number of transactions the service reports |
| `unreadable` | number | Records omitted because this client could not decode them |
| `transactions[].txId` | string | Transaction id |
| `transactions[].state` | string | `pending` \| `signed` \| `success` \| `failed` |
| `transactions[].verified` | boolean | Whether the record reconciled with the chain |
| `transactions[].unverifiedReason` | string? | Present only when `verified` is `false` |
| `transactions[].contractType` / `operation` | string | Machine enum / human operation name |
| `transactions[].rawAmount` | string | Raw integer amount; units follow the contract type |
| `transactions[].originator` / `owner` | string | Who created it / whose account it acts on |
| `transactions[].permission` | object | `id`, `name`, `threshold` |
| `transactions[].currentWeight` / `missingWeight` / `thresholdReached` | — | Approval progress |
| `transactions[].awaitingMySignature` | boolean | Whether it is waiting on the selected account |
| `transactions[].signedByCurrentAccount` | boolean | Whether this account already signed |

A record the client cannot reconcile with the chain stays visible and is labelled rather than failing the whole page.

**`--create` / `--sign`**

| Field | Type | Meaning |
|---|---|---|
| `signer` / `signerWeight` | string / number | The address that just signed, and its weight |
| `hex` | string | The transaction hex including all signatures gathered so far |
| `transaction` | object | Transaction summary + approval progress |

`--watch` streams count nudges and emits no terminal JSON frame.

## Exit status

`0` success · `1` execution failure (`tronlink_credentials_missing`, `not_found` — txId not on the service, `not_authorized`, `already_signed`, `tx_expired`, `auth_failed`, `provider_error` — service error / rate limit) · `2` usage error (`invalid_value` — including an already-signed transaction passed to `--create`, conflicting modes).

## See also

[`tx sign`](sign.md) · [`tx approvals`](approvals.md) · [`tx broadcast`](broadcast.md) · [`config`](../config.md) · [`permission show`](../permission/show.md)
