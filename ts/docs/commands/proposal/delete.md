# wallet-cli proposal delete

Cancel a proposal created by the selected account during its voting window.

## Synopsis

```
wallet-cli proposal delete <id> [--dry-run | --sign-only | --build-only] [options]
```

## Description

The account must be both a registered witness and the proposal's `proposer_address`. A successful delete produces the chain state `CANCELED`; it is distinct from `proposal approve --cancel`, which removes only one approval.

## Options

`<id>` is required. Transaction controls are `--dry-run`, `--sign-only`, `--build-only`, `--expiration` (build/sign-only, max 24 h), `--permission-id`, `--account`, `--wait`, and `--password-stdin`.

## Example

```bash
echo "$PW" | wallet-cli proposal delete 48 --network tron:nile --wait --password-stdin
```

## Output

Returns `kind: "proposal-delete"`, proposal/proposer identity, transaction stage/id, and confirmed resource usage.

## Exit status

`0` built/signed/submitted · `1` `proposal_not_found`, `not_proposal_owner`, `proposal_expired`, `already_canceled`, signer/auth, RPC, or chain failure · `2` invalid input.

## See also

[`proposal approve`](approve.md) · [`proposal show`](show.md)
