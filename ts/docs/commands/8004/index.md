# wallet-cli 8004

Read and manage ERC-8004 Agent identities.

An ERC-8004 Identity Registry is an NFT contract: each Agent is a token whose id is its Agent ID and whose URI points to a registration document you host yourself. wallet-cli reads the registry and signs registry transactions; it does not build or host the document.

## Synopsis

```
wallet-cli 8004 COMMAND
```

## Subcommands

| Command | Page | Description |
|---|---|---|
| `8004 show` | [show.md](show.md) | Load one Agent: owner, URI, approved operator, and its registration document |
| `8004 operator-check` | [operator-check.md](operator-check.md) | Whether an operator may manage all of an owner's Agents |
| `8004 register` | [register.md](register.md) | Register a new Agent |
| `8004 update` | [update.md](update.md) | Change an Agent's URI |
| `8004 transfer` | [transfer.md](transfer.md) | Transfer an Agent to a new owner |
| `8004 approve` | [approve.md](approve.md) | Approve an operator for one Agent, or clear the approval |
| `8004 add-operator` | [add-operator.md](add-operator.md) | Let an operator manage every Agent this account owns |
| `8004 remove-operator` | [remove-operator.md](remove-operator.md) | Remove that permission |

## How it works

- **Networks.** The registry is deployed on `tron`, `nile`, `shasta`, `bsc`, `bsc-testnet`, `base`, and `base-sepolia`. On `ethereum` and `sepolia` every command fails with `unsupported_network_capability`.
- **Agent IDs** are decimal strings. An id may carry its canonical network id, as in `tron:3448148188:172` or `eip155:97:42` (aliases such as `nile:172` are not accepted); that network must be the selected one, or the command fails with `chain_id_mismatch`.
- **URIs** must be `https://`, `ipfs://`, or a base64 JSON `data:` URI, at most 2048 characters. [`show`](show.md) loads only `https://` and `http://` registration documents, so prefer `https://`.
- **Reads** (`show`, `operator-check`) need no wallet. **Writes** sign with the active account and take the usual transaction options: `--wait`, `--sign-only`, `--build-only`, and on TRON `--fee-limit`, `--permission-id`, `--expiration`.
- **Who may write.** `update` and `transfer` need the Agent's owner, its approved operator (from `approve`), or an operator of the owner (from `add-operator`). `approve` needs the owner or an operator of the owner — an Agent's own approved operator cannot pass the approval on. Anyone else is refused during fee estimation, before signing, with `not_authorized`; an Agent ID that does not exist fails with `agent_not_found`.
- **Receipts** group the Agent fields under `data.identity`. Values read from the chain after the change — a new Agent's `agentId`, `newURI`, `newOwner`, an operator's `approved` — appear only with `--wait`.

## See also

[`contract send`](../contract/send.md) · [Script safety](../../machine-interface.md#script-safety-never-mistake-submitted-for-confirmed)
