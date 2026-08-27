# wallet-cli proposal

Create and vote on governance proposals.

A proposal is a set of **chain-parameter changes** — the same parameters [`chain params`](../chain/params.md) reports — that super representatives vote on. Reading proposals is open to anyone; creating, approving, and deleting them requires a registered witness ([`witness create`](../witness/create.md)).

The mechanics that shape every subcommand:

- **Approve or un-approve only.** There is no "against" vote — an SR either adds its approval or withdraws it.
- **Nothing settles early.** A proposal stays in its voting window until `expiration_time`, even once it has enough approvals; it is tallied at the maintenance cycle that follows.
- **Only the top-27 active SRs count.** Any registered witness can approve and the transaction succeeds, but the tally filters to active SRs and needs ≥ 70 % of them.
- **Approved changes apply immediately** at that tally — the parameter is live from then on.

States: `voting` (in the window) · `approved` (met the threshold, applied, final) · `disapproved` (expired below the threshold, final) · `canceled` (withdrawn by its creator before expiry, final).

**TRON only.** On-chain parameter governance is a TRON protocol feature; every subcommand here fails with `family_mismatch` on an EVM network.

## Synopsis

```
wallet-cli proposal COMMAND
```

## Subcommands

| Command | Page | Description |
|---|---|---|
| `proposal list` | [list.md](list.md) | List proposals with approval progress |
| `proposal show` | [show.md](show.md) | Full detail of one proposal |
| `proposal create` | [create.md](create.md) | Create a proposal to change chain parameters |
| `proposal approve` | [approve.md](approve.md) | Approve a proposal, or cancel your approval |
| `proposal delete` | [delete.md](delete.md) | Delete a proposal you created |

## See also

[`witness`](../witness/index.md) · [`chain params`](../chain/params.md) · [`vote list`](../vote/list.md)
