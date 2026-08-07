# wallet-cli contract set-user-resource-percent

Set the percentage of call energy paid by the caller.

## Synopsis

```
wallet-cli contract set-user-resource-percent <address> <percent>
                                             [--dry-run | --sign-only | --build-only] [options]
```

## Description

The value maps unchanged to `consume_user_resource_percent`: 100 means the caller pays all energy; 0 assigns the full nominal share to the deployer, still capped by `origin_energy_limit` and available staked energy. Only the contract's `origin_address` may change it.

## Arguments

| Argument | Description |
|---|---|
| `address` | Contract governed by the selected deployer account |
| `percent` | Integer 0–100 paid by the caller |

Transaction controls are `--dry-run`, `--sign-only`, `--build-only`, `--expiration` (build/sign-only, max 24 h), `--permission-id`, `--account`, `--wait`, and `--password-stdin`.

## Example

```bash
echo "$PW" | wallet-cli contract set-user-resource-percent TQ5nJ8mV... 100 --network tron:nile --wait --password-stdin
```

## Output

Returns contract/deployer addresses, `consumeUserResourcePercent`, transaction stage/id, and confirmed resource usage.

## Exit status

`0` built/signed/submitted · `1` `contract_not_found`, `not_contract_deployer`, signer/auth, RPC, or chain failure · `2` percentage or mode error.

## See also

[`contract set-origin-energy-limit`](set-origin-energy-limit.md) · [Energy & bandwidth](../../concepts/energy-bandwidth.md)
