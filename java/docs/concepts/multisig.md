# Multi-signature concepts

Multi-signature allows other users to access an account in order to better manage it. This is the model behind the [multi-sign commands](../commands/multisig.md).

## Permission types

There are three types of access:

- **owner** — access to the owner of the account.
- **active** — access to other features of accounts, and access that authorizes a certain feature. Block production authorization is not included if it's for witness purposes.
- **witness** — only for witness; block production authorization will be granted to one of the other users.

If an account is not a witness, it is not necessary to set `witness_permission`, otherwise an error will occur.

## Keys, weights, and threshold

A permission lists one or more keys, each with a **weight**, and a **threshold**. A transaction under that permission is valid once the combined weight of the collected signatures meets the threshold.

For example, if a permission grants active access to two accounts each with weight 1 and a threshold of 2, both must sign before the transaction takes effect. Signatures can be gathered on the same CLI, or across multiple CLIs using `addTransactionSign` on the transaction hex string — after which the final transaction is broadcast manually.

You can inspect progress with:

- [`getTransactionSignWeight`](../commands/multisig.md#gettransactionsignweight) — current accumulated weight vs the permission threshold.
- [`getTransactionApprovedList`](../commands/multisig.md#gettransactionapprovedlist) — which accounts have already approved.

## See also

- [commands/multisig](../commands/multisig.md) — the commands themselves
