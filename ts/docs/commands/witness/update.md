# wallet-cli witness update

Update an SR candidate's information URL.

## Synopsis

```
wallet-cli witness update --url <url> [--dry-run | --sign-only | --build-only] [options]
```

## Description

The selected account must already be a registered witness. This operation has no registration burn and can be repeated.

## Options

`--url` is required and limited to 256 UTF-8 bytes. Transaction controls are `--dry-run`, `--sign-only`, `--build-only`, `--expiration` (build/sign-only, max 24 h), `--permission-id`, `--account`, `--wait`, and `--password-stdin`.

## Example

```bash
echo "$PW" | wallet-cli witness update --url https://sr.example/v2 --network tron:nile --wait --password-stdin
```

## Output

Returns `kind: "witness-update"`, witness address, URL, transaction stage/id, and confirmed resource usage.

## Exit status

`0` built/signed/submitted · `1` `not_a_witness`, signer/auth, RPC, or chain failure · `2` invalid input.

## See also

[`witness create`](create.md) · [`witness set-brokerage`](set-brokerage.md)
