# ERC-8004 signer handoff

## Development baseline

Use the exact npm dependency `@bankofai/8004-sdk@1.2.0-beta.0` (PR #8 source
`5af14d90bea7c9c21aa52c51f32382b28a1fc02c`). Do not replace it with a local SDK
checkout or a floating beta tag. Production signer bridge implementation is the
only implementation explicitly reserved for the next developer.

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

## Remaining signer adapter

Suggested location: `src/adapters/outbound/erc8004/wallet-signer.ts` and its tests.
Implement the SDK's exported `ExternalSigner` against the existing wallet `Signer`.
The factory should accept the selected `NetworkDescriptor`, wallet `Signer`, and
`SigningScope`; ensure the signer belongs to that selected family/account before
constructing the bridge. Do not export or decrypt a key in the bridge.

| SDK boundary                 | Wallet boundary                                           | Required behavior                                                                                                                                                                         |
| ---------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `address`                    | `signer.address`                                          | Preserve chain address representation; reject incompatible family/address                                                                                                                 |
| `signTransaction(tx)` (EVM)  | `signer.sign(ethersTx, opts)`                             | Map viem gas→gasLimit, transaction type to ethers type, retain chainId/nonce/to/data/value/accessList and legacy/EIP-1559 fee fields. Extract `{ raw, hash }.raw` as the SDK return value |
| `signTransaction(tx)` (TRON) | `signer.sign(tx, opts)`                                   | Preserve complete transaction/protobuf identity; return the complete signed object                                                                                                        |
| `signTypedData(payload)`     | `signer.signTypedData(normalizeTypedData(payload), opts)` | Return the `signature` field with one 0x prefix; retain family-specific EIP-712/TIP-712 hashing                                                                                           |
| optional `signMessage`       | `signer.signMessage(message, opts)`                       | Only expose after explicitly supporting the SDK's string/raw-bytes message semantics; never stringify arbitrary objects                                                                   |

All signing calls use `obtainSignature(signer, scope, callback)`, preserving Ledger
precheck, awaiting-device event, timeout and abort. Do not add a second device
prompt or a silent software fallback. Keep an absent optional capability absent.

The bridge signs only. SDK direct submit APIs broadcast through the SDK; the
wallet's production command path broadcasts through TxPipeline. Do not plug a
SDK submit call inside TxPipeline, or use the bridge to impersonate a transaction
hash. Connecting direct SDK submission to CLI execution modes is a separate
architecture decision, not needed to finish this bridge.

## Acceptance tests for the reserved work

1. EVM legacy/EIP-1559 transactions preserve every signing field; recover the
   signed transaction sender and chainId and compare to the selected account/network.
2. TRON signed transaction preserves raw_data/raw_data_hex/txID and permission ID;
   verify the signature rather than testing only that a callback ran.
3. Typed-data signatures verify against the expected account for both families.
4. Device precheck failure, rejection, timeout and abort propagate; no broadcast
   occurs from the bridge and no private key appears in output/errors.
5. Reject wrong network, malformed signing results and unsupported capability.
6. Run contract tests using the published beta SDK and this adapter, not a mock SDK.
7. Record real Ledger testing separately from software/mock tests; obtain a funded
   test account explicitly for any new chain transaction validation.

## Validation commands

From `ts/`:

```sh
npm ci
npm run typecheck
npm test
npm run lint
npm run depcruise
npm run build
```

Focused CLI integration: `npm test -- --run test/erc8004.test.ts`.
These tests spawn the real CLI against local EVM/TRON RPC servers and verify
configured RPC credentials and large agent IDs without requiring a wallet.
