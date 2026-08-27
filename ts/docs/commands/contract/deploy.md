# wallet-cli contract deploy

Deploy contract bytecode.

## Synopsis

```
wallet-cli contract deploy (--artifact <path> | --code <hex> | --code-file <path>)
                           [--constructor-args <json> | --constructor-params <json>]
                           [--constructor-signature <sig>]
                           [--dry-run | --sign-only | --build-only | --wait [--wait-timeout <ms>]]
                           [--abi <json>] [--fee-limit <sun>] [--permission-id <n>] [--expiration <ms>]   # TRON
                           [--gas-limit <n>] [--max-fee <gwei>] [--priority-fee <gwei>] [--nonce <n>]     # EVM
                           [options]
```

## Description

Deploys contract creation bytecode from the active account (or `--account`) and reports the new contract's address, on TRON and EVM networks alike.

**Where the bytecode comes from** — exactly one of three, else `invalid_value`:

| Source | Use it when |
|---|---|
| `--artifact <path>` | **Preferred.** A compiler artifact (Foundry, Hardhat/sunhat, TronBox) that holds *both* the bytecode and the ABI, so the constructor's types come from the compiler rather than from you |
| `--code-file <path>` | You have only the bytecode, in a file — creation bytecode routinely exceeds the shell's argument limit |
| `--code <hex>` | You have only the bytecode and it is short enough to pass inline |

An artifact is read for `.bytecode.object`, `.bytecode`, or `.evm.bytecode.object`, and its `abi` when present. An artifact with no creation bytecode, or holding only `"0x"` (an interface or abstract contract), is refused rather than deployed as nothing.

**Where the constructor's types come from.** `--constructor-args` takes bare values (`["18","MyToken"]`) and needs the types from somewhere: `--artifact`'s ABI, an explicit `--constructor-signature`, or `--abi` on TRON. With none of those it is `invalid_value`. `--constructor-params` takes self-describing `{"type","value"}` entries instead and needs no type source — but it is rejected alongside `--artifact`, whose ABI already declares them. `--constructor-signature` is likewise rejected alongside `--artifact`, and is **not accepted on TRON at all**: the node needs the full ABI there, not just the constructor's types.

**TRON needs an ABI.** Pass `--artifact` or `--abi`; passing both is an error. `--abi` is TRON-only, and the ABI's `constructor` entry needs a string `stateMutability` (`"nonpayable"` / `"payable"`) — `solc` emits it, but a hand-trimmed ABI or one from `solc` older than 0.5 may not. EVM deploys need no ABI when the types come from `--constructor-signature` or the arguments are self-describing.

Same execution model as other broadcast commands: `--dry-run` previews, `--sign-only` outputs a signed transaction for [`tx broadcast`](../tx/broadcast.md), `--build-only` an unsigned one, default returns at submission, `--wait` blocks until confirmed/failed.

Fee flags follow the family — `--fee-limit` (TRON, default `100000000` SUN) or `--gas-limit` / `--max-fee` / `--priority-fee` / `--nonce` (EVM). Help tags each set, and using one on the other family is refused with `invalid_option`.

Requires an account. The master password (via `--password-stdin`) is needed only by the modes that sign — `--dry-run` and `--build-only` do not unlock the wallet and run without it. Watch-only accounts fail with `watch_only_no_signer` in a signing mode.

## Options

| Option | Description |
|---|---|
| `--artifact <path>` | **Required** (one of). Compiler artifact holding the bytecode and ABI |
| `--code <hex>` | **Required** (one of). Creation bytecode, hex-encoded |
| `--code-file <path>` | **Required** (one of). File holding the creation bytecode |
| `--constructor-args <json>` | Constructor arguments as a JSON array of bare values, e.g. `["18","MyToken"]` |
| `--constructor-params <json>` | Constructor arguments as `{"type","value"}` entries; excludes `--artifact` |
| `--constructor-signature <sig>` | The constructor's types when there is no ABI, e.g. `constructor(uint256,string)`; excludes `--artifact`, and not accepted on TRON |
| `--dry-run` | Estimate only; excludes `--sign-only` / `--build-only` |
| `--sign-only` | Sign without broadcasting, output the signed hex; excludes `--dry-run` / `--build-only` |
| `--build-only` | Build only, output the **unsigned** hex; excludes `--dry-run` / `--sign-only` |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--password-stdin` | Master password from stdin |

TRON only:

| Option | Description |
|---|---|
| `--abi <json>` | Contract ABI as a JSON array string; required unless `--artifact` supplies one |
| `--fee-limit <sun>` | Max energy fee to burn, in SUN (default 100000000) |
| `--permission-id <n>` | Permission group to sign with (0=owner, 1=witness, 2-9=active); default `0` |
| `--expiration <ms>` | Transaction expiration in ms, up to `86400000` (24h); only with `--sign-only` or `--build-only`; omitted = node default (~60s) |

EVM only:

| Option | Description |
|---|---|
| `--gas-limit <n>` | Gas units to authorise; default is the node's estimate, unpadded |
| `--max-fee <gwei>` | Maximum total fee per gas (EIP-1559 chains only) |
| `--priority-fee <gwei>` | Tip per gas (EIP-1559 chains only) |
| `--nonce <n>` | Transaction nonce; default is the account's pending nonce |

Plus the [global options](../index.md#global-options-every-command).

## Examples

In the examples, `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`.

From a compiler artifact — the same command on either family, since the artifact carries the ABI:

```bash
echo "$PW" | wallet-cli contract deploy --artifact ./build/contracts/Token.json --constructor-args '["18","MyToken"]' --network tron:nile --password-stdin
echo "$PW" | wallet-cli contract deploy --artifact ./out/Token.sol/Token.json --constructor-args '["18","MyToken"]' --network evm:11155111 --password-stdin
```

```console
⏳ Contract deployed
  Address  TXg3jWThoa5AxuwRA4aRyFAhmRN9hjhQFU
  TxID     b7c...
  Status   pending — not yet on-chain
! Track it: wallet-cli tx info --network tron:nile --txid b7c...
```

From bare bytecode on EVM, stating the constructor's types yourself:

```bash
echo "$PW" | wallet-cli contract deploy --code-file ./Token.bin --constructor-signature 'constructor(uint8,string)' --constructor-args '["18","MyToken"]' --network evm:11155111 --password-stdin
```

Rehearsing an EVM deploy — the address is already known, and the fee is a gas ceiling:

```bash
wallet-cli contract deploy --code 0x60006000f3 --network evm:11155111 --dry-run
```

```console
⏳ Dry run contract deploy
  Address  0xF3741D160A1E64A8D71fFE64CC0F111ddC7720E5
  Fee      ≤ 0.000117 ETH  (53,857 gas × 2.186156 gwei max)
  Tx       {"data":"0...000000"}
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"contract.deploy","data":{"kind":"contract-deploy","mode":"dry-run","fee":{"feeModel":"eip1559","maxCostWei":"117739814894256","gasLimit":"53857","maxPerGasWei":"2186156208"},"tx":{"data":"0x60006000f3","value":"0","chainId":11155111,"nonce":0,"gasLimit":"53857","type":2,"maxFeePerGas":"2186156208","maxPriorityFeePerGas":"1000000"},"nonce":0,"contractAddress":"0xF3741D160A1E64A8D71fFE64CC0F111ddC7720E5"},"meta":{"durationMs":565,"warnings":[]},"chain":{"family":"evm","network":"evm:11155111","chainId":"11155111"}}
```

```bash
echo "$PW" | wallet-cli contract deploy --artifact ./build/contracts/Token.json --network tron:nile --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"contract.deploy","data":{"kind":"contract-deploy","contractAddress":"TXg3jWThoa5AxuwRA4aRyFAhmRN9hjhQFU","stage":"submitted","txId":"b7c..."},"meta":{"durationMs":15,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind: "contract-deploy"`, `contractAddress` (deterministic new address), `stage: "submitted"`, `txId` |
| `--wait` (confirmed) | above, plus `confirmed`, `blockNumber`, `failed`, and the realised cost — `feeSun` on TRON, `gasUsed` / `feeWei` / `effectiveGasPriceWei` on EVM |
| `--dry-run` | `kind`, `mode: "dry-run"`, `contractAddress`, `fee`, the unsigned `tx` (plus `nonce` on EVM) |
| `--sign-only` / `--build-only` | `kind`, `mode`, `hex`, `fee`, the transaction object |

`contractAddress` is computed locally from the deployer and nonce, so it is known before the transaction confirms.

## Exit status

`0` submitted (or built/signed/dry-run in early-exit modes) · `1` execution failure (`watch_only_no_signer`, `auth_failed`, `rpc_error`, `timeout`) · `2` usage error — `file_not_found` (no artifact/bytecode file at that path), or `invalid_value` for: none or more than one of `--artifact` / `--code` / `--code-file`; an artifact that is not JSON, has no creation bytecode, or holds only `"0x"`; `--constructor-args` with no type source; `--constructor-params` or `--constructor-signature` alongside `--artifact`; a TRON deploy with neither `--abi` nor `--artifact`, or with both; `--constructor-signature` on TRON; an ABI constructor without a string `stateMutability`.

## See also

[`contract info`](info.md) · [`contract send`](send.md) · [`contract create2`](create2.md) · [`tx status`](../tx/status.md)
