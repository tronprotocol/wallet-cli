# wallet-cli contract clear-abi

Irreversibly remove a contract's on-chain ABI metadata.

## Synopsis

```
wallet-cli contract clear-abi <address> [--dry-run | --sign-only | --build-only] [options]
```

## Description

Only `SmartContract.origin_address` may execute this operation. The CLI verifies that address before building. Clearing the ABI does not alter bytecode or storage, but explorers and SDKs can no longer discover the interface from chain metadata. It cannot be restored.

## Options

`<address>` is required. Transaction controls are `--dry-run`, `--sign-only`, `--build-only`, `--expiration` (build/sign-only, max 24 h), `--permission-id`, `--account`, `--wait`, and `--password-stdin`.

## Example

```bash
echo "$PW" | wallet-cli contract clear-abi TQ5nJ8mV... --network tron:nile --wait --password-stdin
```

## Output

Returns `kind: "contract-clear-abi"`, contract/deployer addresses, transaction stage/id, and confirmed resource usage.

## Exit status

`0` built/signed/submitted · `1` `contract_not_found`, `not_contract_deployer`, signer/auth, RPC, or chain failure · `2` invalid input.

## See also

[`contract info`](info.md) · [`contract set-origin-energy-limit`](set-origin-energy-limit.md)
