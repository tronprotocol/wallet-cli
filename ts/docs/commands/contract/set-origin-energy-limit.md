# wallet-cli contract set-origin-energy-limit

Set the deployer's per-call energy contribution cap.

## Synopsis

```
wallet-cli contract set-origin-energy-limit <address> <energy>
                                            [--dry-run | --sign-only | --build-only] [options]
```

## Description

`origin_energy_limit` caps what the deployer can cover for one call; it is not a total contract or caller limit. The actual subsidy is also bounded by the deployer's staked energy and the caller/deployer split. The CLI requires `energy > 0`, verifies `origin_address`, and locally builds the protocol transaction without TronWeb's obsolete 10,000,000 policy cap.

## Arguments

| Argument | Description |
|---|---|
| `address` | Contract governed by the selected deployer account |
| `energy` | Positive signed-int64 energy cap |

Transaction controls are `--dry-run`, `--sign-only`, `--build-only`, `--expiration` (build/sign-only, max 24 h), `--permission-id`, `--account`, `--wait`, and `--password-stdin`.

## Example

```bash
echo "$PW" | wallet-cli contract set-origin-energy-limit TQ5nJ8mV... 50000000 --network tron:nile --wait --password-stdin
```

## Output

Returns contract/deployer addresses, `originEnergyLimit`, transaction stage/id, and confirmed resource usage.

## Exit status

`0` built/signed/submitted · `1` `contract_not_found`, `not_contract_deployer`, signer/auth, RPC, or chain failure · `2` non-positive/out-of-int64 integer or invalid mode.

## See also

[`contract set-user-resource-percent`](set-user-resource-percent.md) · [Energy & bandwidth](../../concepts/energy-bandwidth.md)
