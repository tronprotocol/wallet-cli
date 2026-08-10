# wallet-cli witness set-brokerage

Set the percentage of rewards retained by the SR.

## Synopsis

```
wallet-cli witness set-brokerage <percent> [--dry-run | --sign-only | --build-only] [options]
```

## Description

`percent` is the SR-retained brokerage, exactly matching Java wallet-cli and `UpdateBrokerageContract`: 20 means the SR keeps 20% and voters share 80%. The value is never reversed by the client. The selected account must be a registered witness.

## Arguments

| Argument | Description |
|---|---|
| `percent` | Integer 0–100 retained by the SR |

Transaction controls are `--dry-run`, `--sign-only`, `--build-only`, `--expiration` (build/sign-only, max 24 h), `--permission-id`, `--account`, `--wait`, and `--password-stdin`.

## Example

```bash
echo "$PW" | wallet-cli witness set-brokerage 20 --network tron:nile --wait --password-stdin
```

## Output

Returns witness address, the unchanged brokerage value, transaction stage/id, and confirmed resource usage.

## Exit status

`0` built/signed/submitted · `1` `not_a_witness`, signer/auth, RPC, or chain failure · `2` percentage or mode error.

## See also

[`vote list`](../vote/list.md) · [`reward`](../reward/index.md)
