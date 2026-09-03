# Proposals

On-chain governance proposals. Any proposal-related operations, except for viewing operations, must be performed by committee members.

## CreateProposal

Initiate a proposal.

```console
> createProposal [OwnerAddress] id0 value0 ... idN valueN
```

- `OwnerAddress` (optional) — the address of the account which initiated the transaction. Default: the address of the login account.
- `id0` — the serial number of the parameter. Every parameter of the TRON network has a serial number. Please refer to `http://tronscan.org/#/sr/committee`.
- `Value0` — the modified value.

Values are passed to the chain verbatim — the CLI does no unit conversion, so a SUN-denominated parameter must be given in SUN. In the example, proposal No.4 (the token issuance fee) is set to the raw value `1000`, which is 1000 SUN:

```console
> createProposal 4 1000
> listproposals  # View initiated proposal
{
    "proposals": [
        {
            "proposal_id": 1,
            "proposer_address": "TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ",
            "parameters": [
                {
                    "key": 4,
                    "value": 1000
                }
            ],
            "expiration_time": 1567498800000,
            "create_time": 1567498308000
        }
    ]
}
```

The corresponding id is 1.

## ApproveProposal

Approve / disapprove a proposal.

```console
> approveProposal [OwnerAddress] id is_or_not_add_approval
```

- `OwnerAddress` (optional) — the address of the account which initiated the transaction. Default: the address of the login account.
- `id` — ID of the initiated proposal. Example: 1.
- `is_or_not_add_approval` — true for approve; false for disapprove.

Example:

```console
> ApproveProposal 1 true  # in favor of the offer
> ApproveProposal 1 false  # Cancel the approved proposal
```

## DeleteProposal

Delete an existing proposal. The proposal must be canceled by the supernode that initiated the proposal.

```console
> deleteProposal [OwnerAddress] proposalId
```

`proposalId` — ID of the initiated proposal. Example: 1.

Example:

```console
> DeleteProposal 1
```

## Obtain proposal information

- `ListProposals` — obtain a list of initiated proposals.
- `ListProposalsPaginated` — use the paging mode to obtain the initiated proposals.
- `GetProposal` — obtain proposal information based on the proposal ID.

## See also

- [exchange](exchange.md) — the built-in Bancor exchange
- [dex](dex.md) — the TRON-DEX order market
- [multisig](multisig.md) — committee/multi-sig operations
