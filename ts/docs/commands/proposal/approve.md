# wallet-cli proposal approve

Add or remove the selected witness's approval.

## Synopsis

```
wallet-cli proposal approve <id> [--cancel]
                            [--dry-run | --sign-only | --build-only] [options]
```

## Description

TRON proposals have approval and un-approval, not an against vote. The default maps to Java `is_add_approval=true`; `--cancel` maps to `false`. Any registered witness may submit the transaction, but only active SR approvals count when the chain settles the proposal.

## Options

| Option | Description |
|---|---|
| `<id>` | Positive proposal id |
| `--cancel` | Remove this witness's existing approval |
| `--dry-run`, `--sign-only`, `--build-only` | Mutually exclusive transaction modes |
| `--expiration <ms>` | Transaction expiration in ms, up to `86400000` (24h); only with `--sign-only` or `--build-only`; omitted = node default (~60s) |
| `--permission-id <n>` | Permission group to sign with (0=owner, 1=witness, 2-9=active); default `0` |

## Example

```bash
echo "$PW" | wallet-cli proposal approve 47 --cancel --network tron:nile --wait --password-stdin
```

## Output

The receipt returns `addApproval`, the projected approval count, threshold, witness address, and transaction/resource fields.

## Exit status

`0` built/signed/submitted · `1` `not_a_witness`, `proposal_not_found`, `proposal_expired`, `already_approved`, `not_approved`, signer/auth, or chain failure · `2` invalid input.

## See also

[`proposal show`](show.md) · [`proposal delete`](delete.md)
