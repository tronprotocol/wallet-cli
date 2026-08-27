# wallet-cli tx send

Send the native coin, or a token, with a human `--amount`.

## Synopsis

```
wallet-cli tx send --to <address|contact> (--amount <n> | --raw-amount <n>)
                   [--token <symbol> | --contract <address> | --asset-id <id>]
                   [--dry-run | --sign-only | --build-only | --wait [--wait-timeout <ms>]]
                   [--fee-limit <sun>] [--permission-id <n>] [--expiration <ms>]        # TRON
                   [--gas-limit <n>] [--max-fee <gwei>] [--priority-fee <gwei>] [--nonce <n>]  # EVM
                   [options]
```

## Description

Builds, signs, and submits a transfer from the active account (or `--account`), on TRON or EVM networks alike. What is sent depends on which selector you pass:

- **none** → the network's native coin (TRX, ETH, BNB …);
- `--token <symbol>` → token resolved from the local address book;
- `--contract <address>` → token by contract address (TRC20 on TRON, ERC20 on EVM);
- `--asset-id <id>` → **TRON only**, TRC10 by numeric asset id.

Amounts: `--amount` is human units (native coin, or token units respecting the token's decimals); `--raw-amount` is the raw integer (SUN / wei, or token base units). Exactly one of the two.

Where the decimals come from: the native coin's are fixed by the family (6 on TRON, 18 on EVM), but a
token's are read from the chain — from the contract for TRC20/ERC20, from the asset record for TRC10. `--amount` is therefore scaled by a number the
node supplies, and a node that misreports it moves the decimal point on the amount you sign. The
value is checked against the protocol range (a TRC10 precision is 0..6, and a record answering for
a different id is refused outright), but a wrong value *inside* that range cannot be detected
locally — there is nothing to compare it against. When the exact base-unit quantity matters, pass
`--raw-amount`, which is used verbatim and never rescaled.

Early exits: `--dry-run` builds and estimates only — no signature, no broadcast, nothing leaves your machine; `--sign-only` signs and prints the signed transaction **hex**; `--build-only` builds but does **not** sign, printing the **unsigned** hex. The hex is protobuf on TRON and RLP (`0x02…`) on EVM; either feeds [`tx sign`](sign.md) and [`tx broadcast`](broadcast.md).

**Fees are family-specific.** TRON burns bandwidth/energy and caps the energy spend with `--fee-limit`; EVM pays gas, so `--gas-limit`, `--max-fee`, `--priority-fee` and `--nonce` apply instead. Help tags each set `(tron only)` / `(evm only)`, and using one on the other family is refused with `invalid_option` — as are `--max-fee` / `--priority-fee` on an EVM chain that still prices in `gasPrice`.

Omitted EVM values are taken from the node: the gas limit from `eth_estimateGas` (unpadded), the fee ceiling from the current base fee, and the nonce from the account's pending count. When the estimate itself fails — an unfunded account, a call the node reverts — the error says so and `--gas-limit` proceeds without one. A fee that is signable but questionable (a tip clamped to the ceiling, a ceiling below the current base fee) is reported in `meta.warnings` rather than refused.

TRON multi-sig uses `--permission-id` to select the signing group and `--expiration` to extend how long co-signers have to add their signatures.

**By default the command returns at submission** (`stage: "submitted"`), not confirmation — add `--wait` to block until confirmed/failed, or poll [`tx status`](status.md).

Requires an account and the master password via `--password-stdin` — signing commands do not show an interactive prompt, so without it the command fails with `auth_required`.

## Options

| Option | Description |
|---|---|
| `--to <address\|contact>` | **Required.** Recipient address for the selected network, or a name from the [contact book](../contact/index.md) |
| `--amount <string>` | Human amount; mutually exclusive with `--raw-amount` |
| `--raw-amount <string>` | Raw integer amount in native base units (SUN / wei) or token base units |
| `--token <string>` | Token symbol from the address book; excludes `--contract`, `--asset-id` |
| `--contract <string>` | Token contract address; omit for a native-coin transfer |
| `--dry-run` | Build and estimate only; excludes `--sign-only` / `--build-only` |
| `--sign-only` | Sign without broadcasting, output the signed hex; excludes `--dry-run` / `--build-only` |
| `--build-only` | Build only, output the **unsigned** hex; excludes `--dry-run` / `--sign-only` |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default 60000; on cap returns the submitted receipt) |
| `--password-stdin` | Master password from stdin |

TRON only:

| Option | Description |
|---|---|
| `--asset-id <string>` | TRC10 numeric asset id |
| `--fee-limit <string>` | Max TRX energy fee to burn for TRC20 transfers, in SUN (default 100000000) |
| `--permission-id <n>` | Permission group to sign with (0=owner, 1=witness, 2-9=active); default `0` |
| `--expiration <ms>` | Transaction expiration in ms, up to `86400000` (24h); only with `--sign-only` or `--build-only`; omitted = node default (~60s) |

EVM only:

| Option | Description |
|---|---|
| `--gas-limit <string>` | Gas units to authorise; default is the node's estimate, unpadded |
| `--max-fee <gwei>` | Maximum total fee per gas — `25` or `25gwei` (EIP-1559 chains only) |
| `--priority-fee <gwei>` | Tip per gas paid to the proposer — `25` or `25gwei` (EIP-1559 chains only) |
| `--nonce <n>` | Transaction nonce; default is the account's pending nonce |

Plus the [global options](../index.md#global-options-every-command).

## Examples

> **Password**: except for `--dry-run`, the examples below omit the password to keep the focus on the selector flags. A real send needs the master password on stdin — prefix with `printf '%s' "$PW" |` and append `--password-stdin` (see the description above).

```bash
# 1 TRX on Nile; 1 ETH-denominated amount on Sepolia
wallet-cli tx send --to TSx72ViULFepRGCS4PM5dP4FqD1d8qggCc --amount 1 --network tron:nile
wallet-cli tx send --to 0x7B28FE10FBccE88c3967ff0Fd64f1ffB46b46C9C --amount 0.0001 --network evm:11155111

# token by address-book symbol on either family; TRC10 by asset id on TRON only
wallet-cli tx send --to T... --token USDT --amount 5 --network tron:nile
wallet-cli tx send --to 0x... --token USDC --amount 5 --network evm:11155111
wallet-cli tx send --to T... --asset-id 1002000 --raw-amount 1000000 --network tron:nile

# rehearse without signing
wallet-cli tx send --to TSx72ViULFepRGCS4PM5dP4FqD1d8qggCc --amount 1 --network tron:nile --dry-run -o json
```

`--dry-run` prints the fee in the selected network's model — bandwidth/energy on TRON, a gas ceiling on EVM:

```console
⏳ Dry run tx send
  To   TMowUdZm5F4iircH2gnaUSCfDa3hdNLn7V
  Fee  0.1 TRX
  Tx   ff87701b0a...18ad8381
```

```console
⏳ Dry run tx send
  To   0x7B28FE10FBccE88c3967ff0Fd64f1ffB46b46C9C
  Fee  ≤ 0.000044 ETH  (21,000 gas × 2.13664 gwei max)
  Tx   {"to":"0x7...000000"}
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"tx.send","data":{"kind":"send","mode":"dry-run","fee":{"feeModel":"eip1559","maxCostWei":"41797991046000","gasLimit":"21000","maxPerGasWei":"1990380526"},"tx":{"to":"0x7B28FE10FBccE88c3967ff0Fd64f1ffB46b46C9C","value":"100000000000000","chainId":11155111,"nonce":0,"gasLimit":"21000","type":2,"maxFeePerGas":"1990380526","maxPriorityFeePerGas":"1000000"},"nonce":0,"rawAmount":"100000000000000","to":"0x7B28FE10FBccE88c3967ff0Fd64f1ffB46b46C9C"},"meta":{"durationMs":753,"warnings":[]},"chain":{"family":"evm","network":"evm:11155111","chainId":"11155111"}}
```

Submit receipt (default mode, text and json):

```bash
printf '%s' "$PW" | wallet-cli tx send --to TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH --amount 1 --network tron:nile --password-stdin
```

```console
⏳ Sent 1 TRX
  To      TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH
  TxID    4574b646adc694e99a1f64e548b2bdf9da62621c2d833f77354f67b751fbd0c4
  Status  pending — not yet on-chain
! Track it: wallet-cli tx info --network tron:nile --txid 4574b646adc694e99a1f64e548b2bdf9da62621c2d833f77354f67b751fbd0c4
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"tx.send","data":{"kind":"send","stage":"submitted","txId":"4574b646adc694e99a1f64e548b2bdf9da62621c2d833f77354f67b751fbd0c4","rawAmount":"1000000","to":"TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH"},"meta":{"durationMs":2172,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data` varies by mode:

| Mode | Fields |
|---|---|
| default (submit) | `kind: "send"`, `stage: "submitted"`, `txId`, `rawAmount` (string), `to`, plus `toContact` when `--to` was a contact name |
| `--wait` (confirmed) | the above, but `stage: "confirmed"`, plus `confirmed`, `blockNumber`, `netUsed` (bandwidth used) or `feeSun` (fee burned), `failed` |
| `--wait` (reverted) | the same fields, but `stage: "failed"` and `failed: true` — the transaction was mined and then reverted |
| `--dry-run` | `kind`, `mode: "dry-run"`, `fee`, unsigned `tx`, `rawAmount`, `to` |
| `--sign-only` | `kind`, `mode: "sign-only"`, `hex` (signed transaction hex), `signed`, `address` (signer), `txId`, `fee`, `rawAmount`, `to` |
| `--build-only` | `kind`, `mode: "build-only"`, `hex` (**unsigned** transaction hex), unsigned `tx`, `fee`, `rawAmount`, `to` |

`signed` is the signed transaction in the chain's own form: a TRON transaction object including `signature[]`, or on EVM `{raw, hash}` — the serialisation `eth_sendRawTransaction` takes, plus the hash derived from those bytes.

On EVM, `data` additionally carries `nonce`, and the confirmed receipt reports `gasUsed`, `feeWei` and `effectiveGasPriceWei` in place of TRON's `netUsed` / `feeSun`.

The `fee` object is shaped by the network's fee model, and `feeModel` names which:

| `feeModel` | Fields |
|---|---|
| `tron-resource` | `bandwidthBurnSunIfNoFreeze`, and `energy*` fields for contract calls |
| `eip1559` / `legacy` | `maxCostWei`, `gasLimit`, `maxPerGasWei` — the per-gas ceiling is `maxFeePerGas` on an EIP-1559 chain and `gasPrice` on a legacy one |

`tx` is a TRON transaction object (`txID`, `raw_data`, `raw_data_hex`) on TRON, and an EVM transaction request on EVM — `to`, `value`, `chainId`, `nonce`, `gasLimit`, plus `type: 2` with `maxFeePerGas` / `maxPriorityFeePerGas`, or `type: 0` with `gasPrice` on a legacy chain. `hex` is protobuf hex on TRON and a `0x`-prefixed RLP encoding on EVM.

A reverted transaction still leaves the envelope at `success: true` and exit `0` — the command completed; the chain rejected the transaction. Scripts must branch on `data.stage`, not on the exit code.

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`rpc_error`, `timeout` — **on timeout the tx may still be in flight; check `tx status` before resending**) · `2` usage error (conflicting selectors/amounts/modes; `invalid_option` when a `(tron only)` flag is used on EVM or vice versa).

An EVM gas estimate that the node rejects surfaces as `rpc_error` naming `eth_estimateGas`, and suggests `--gas-limit` to proceed without one.

`0` also covers `--wait` reporting `stage: "failed"`: the exit code reflects the command, not the on-chain result. See [script safety](../../machine-interface.md#script-safety-never-mistake-submitted-for-confirmed).

## See also

[`tx status`](status.md) · [`tx broadcast`](broadcast.md) · [Fees & resources](../../concepts/networks.md#fees-the-tron-resource-model) · [Script safety](../../machine-interface.md#script-safety-never-mistake-submitted-for-confirmed)
