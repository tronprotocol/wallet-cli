# ERC-8004 SDK integration

The SDK supplies registry configuration and ABIs. Wallet account selection, signing,
device interaction and transaction broadcasting belong to wallet-cli. No SDK
`ExternalSigner` adapter is required or planned for this integration.

## What is already connected

The CLI's eight Identity commands use the SDK's network configuration and ABI
through `adapters/outbound/erc8004/sdk-registry.ts`. RPC reads and receipt reads
continue through the wallet's configured gateway, preserving the API-key header,
timeout and TRON pacing. No indexer or subgraph is required for `show`.

Transactions continue through existing EVM/TRON ContractService and TxPipeline.
That path already supports the wallet's existing software/device signers. This
change does not disable it while waiting for a new adapter. It retains dry-run,
build-only, sign-only, permission-id, expiration and `--wait` behavior. The SDK
registry adapter never calls SDK submit methods and never broadcasts.

`show` returns authoritative chain fields and optional registration metadata.
Metadata failures produce warnings. Registration gets a minted agentId only
from a confirmed receipt. Update/transfer preserve submitted results and add
observed current URI/owner after confirmation. Failed post-confirmation reads
never cause a second transaction. Per-Agent approvals are ERC721 approvals:
`operator` and decimal `agentId`, not a fungible `allowance`.

## Signing boundary

The eight identity commands continue through ContractService and TxPipeline.
They do not call SDK submission methods and do not supply private keys to the SDK.
The SDK's custom external-signer extension was removed in `1.2.0-beta.1`;
this does not remove wallet-cli's independent x402 signer bridge.
