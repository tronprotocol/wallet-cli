# wallet-cli EVM Support Development Plan

> Status: to be implemented
> Applies to: `ts-refactor`
> Purpose: list the full scope of everything that must be modified, added, and accepted when extending the current TRON-only CLI to TRON + EVM. This document deliberately does not expand into the implementation details of functions and RPC payloads.

## 1. Definition of Done

EVM support cannot merely mean "can connect to an Ethereum RPC". When complete, all of the following must hold simultaneously:

1. `evm` is a formal `ChainFamily`, no longer simulated by a type cast in tests.
2. It can resolve Ethereum mainnet `evm:1`, as well as any `evm:<chainId>` added in the config file, e.g. `evm:11155111`, `evm:8453`, `evm:31337`.
3. An EVM network can be selected by canonical id or a unique alias, and can be set as `defaultNetwork`.
4. seed, private key, watch-only, and the Ledger Ethereum app all have explicit EVM behavior.
5. EVM has its own gateway, signing strategy, use cases, and CLI command module, and does not stuff EVM methods into the TRON gateway.
6. `wallet-cli --help`, family help, command help, `--json-schema`, and `wallet-cli networks` all let a user/agent discover EVM.
7. Text and JSON output correctly present EVM address, chain id, native currency, gas, fee, nonce, transaction hash, and receipt.
8. The existing TRON commands, output, secret handling, and exit-code contract remain unchanged.

Development dependency order:

```text
public contract → Domain → Persistence/Config → Application ports → EVM adapters
              → EVM use cases → CLI commands → Bootstrap → Help/Output → Tests/Docs
```

### 1.1 The Real Code-Change Classification

The "locations involved" that appear later in this document include modifications, references, and verification — it does not mean every file must change. Based on the current code, the actual classification is as follows.

#### Definitely added

- `application/ports/chain/evm-gateway.ts`
- `adapters/outbound/chain/evm/*`
- `application/use-cases/evm/*`
- `adapters/inbound/cli/commands/evm/*`
- `bootstrap/families/evm.ts`
- EVM confirmation, fixtures, unit/integration/live tests
- Explorer/history adapter (added only if EVM history/ABI metadata is to be provided)

#### Definitely modified

- Domain family/address/network/wallet/transaction types
- Config builtins, custom-network validation, and network display
- Keystore schema migration and the EVM-address backfill for old wallets
- `ChainGatewayMap` and the family plugin registry
- The file location of the generic gateway registry (currently misplaced in `chain/tron/provider.ts`)
- The outbound Ledger dispatcher (if Ledger EVM is exposed)
- Token builtin/normalization and the CoinGecko network mapping
- Root/family/merged command help, the global `--network` description, and the wallet help examples
- The family renderer, EVM transaction/fee text output
- Dependencies, architecture docs, help/golden baselines

#### In principle not modified, only adding EVM tests to verify reusability

- `application/services/transaction-mode.ts`
- `application/services/pipeline/index.ts`
- `application/services/signer/index.ts`
- `application/services/signer/software.ts`
- `application/services/signer/ledger.ts`
- `application/services/target/index.ts`
- `application/contracts/execution-policy.ts`
- `application/contracts/execution-scope.ts`
- `application/ports/chain/broadcaster.ts`
- `application/ports/ledger-device.ts`
- `application/ports/network-registry.ts`
- `application/ports/token-repository.ts`
- `application/ports/price-provider.ts`
- `adapters/inbound/cli/registry/index.ts`
- `adapters/inbound/cli/shell/index.ts`
- `adapters/inbound/cli/command-id.ts`
- `adapters/inbound/cli/context/index.ts`
- `adapters/inbound/cli/arity/index.ts`
- `adapters/inbound/cli/output/envelope.ts`
- stream, secret, prompt, and output formatter infrastructure

#### Modified only if a public decision requires it

- `CapabilityRegistry` and bootstrap capability composition: needed only if history/indexer, legacy/EIP-1559, etc. require per-network gating.
- Help catalog: EVM commands enter the catalog automatically via the registry; modification is needed only to add a families/networks summary at the top level of the catalog.
- `WalletService`: the existing family detection and repository delegation are reusable; usually only tests are needed, and migration should stay in the persistence adapter.
- Shared transaction types/pipeline: types must be extended with display fields, but the pipeline control flow is in principle unchanged.

If the implementation must modify one of the above "in principle not modified" modules, you should first point out which family-neutral capability the current abstraction lacks; you must not add `if (family === "evm")` just because the EVM adapter is awkward to write.

## 2. Public Decisions to Lock Before Development

The following decisions must be written into the architecture contract first, otherwise help, the network schema, the command schema, and the tests will be revised repeatedly.

### 2.1 Network identity

Network aliases are deferred while selector input accepts canonical ids only. Alias-related requirements below remain future work for when that feature is restored.

- The EVM canonical network id is fixed as `evm:<decimal chainId>`.
- The `xxx` in `evm:xxx` is the EIP-155 chain id, not a name; the actual value must be a positive-integer string.
- Minimum builtin networks:
  - `evm:1`, with recommended aliases `eth`, `ethereum`.
  - One public testnet, recommended `evm:11155111`, alias `sepolia`.
- Other networks are added via `config.yaml`; whether to additionally build in Base, Polygon, BSC, etc. is a product decision.
- An alias must be globally unique; a duplicate alias must keep the `ambiguous_network_alias` error.
- The chain id reported by RPC must match the configured value; the mismatch must not be ignored before signing or broadcast.
- `defaultNetwork` is still recommended to remain `tron:mainnet`, unless there is a separate product migration decision.

The recommended public shape of a custom network:

```yaml
defaultNetwork: evm:1
networks:
  evm:1:
    family: evm
    chainId: "1"
    aliases: [eth, ethereum]
    rpcUrl: https://example.invalid
    feeModel: eip1559
    nativeCurrency:
      name: Ether
      symbol: ETH
      decimals: 18

  evm:31337:
    family: evm
    chainId: "31337"
    aliases: [local]
    rpcUrl: http://127.0.0.1:8545
    feeModel: eip1559
    nativeCurrency:
      name: Ether
      symbol: ETH
      decimals: 18
```

### 2.2 The First-Version Command Surface

The same logical path selects the TRON or EVM implementation via `--network`. A separate top-level `ethereum ...` execution grammar must not be created for EVM.

| Command group | First-version EVM requirement | Notes |
| --- | --- | --- |
| wallet lifecycle | supported | create/import/derive show the EVM address afterward; watch can recognize `0x...`. |
| `account balance` | supported | uses the network native currency. |
| `account info` | supported | EVM semantics are defined by the EVM use case, not by imitating the TRON resource fields. |
| `account history` | explicit decision | standard JSON-RPC has no address history; an explorer/indexer adapter is required, otherwise it must not claim availability in the help/capability of an unsupported network. |
| `account portfolio` | supported | native coin + ERC-20 token book + price provider. |
| `token add/list/remove/balance/info` | supported | the EVM token kind is `erc20`. |
| `tx send/broadcast/status/info` | supported | native/ERC-20, legacy/EIP-1559, raw signed tx. |
| `contract call/send/deploy/info` | supported or explicitly degraded | if `contract info` needs ABI metadata, there must be an explorer source; with only bytecode, the help must describe it truthfully. |
| `message sign` | supported | software and Ledger behavior are consistent. |
| `block` | supported | latest or a specified block. |
| `stake ...` | no EVM implementation | stays TRON-only; root/family help must mark it. |

### 2.3 SDK and Hardware Wallet

- Select a single EVM SDK; the current architecture recommends `viem`, added to production dependencies.
- If full Ledger EVM support is claimed, add an Ethereum Ledger app adapter and the corresponding package (e.g. `@ledgerhq/hw-app-eth`).
- If the first version does not do Ledger EVM, `FAMILIES.evm.ledger`, `import ledger --help`, and the README must not show the Ethereum app.

## 3. Phased Development Checklist

### Phase 0: Contract and Test Baseline

- [ ] Confirm the network id, builtin networks, command matrix, Ledger, and history/indexer decisions in Section 2.
- [ ] Build EVM address, transaction, receipt, legacy fee, EIP-1559 fee, ERC-20, block, and RPC error fixtures.
- [ ] Establish a new multichain help/golden baseline; the existing TRON-only help parity must no longer serve as the sole truth for the entire root help.
- [ ] Define the upgrade strategy and rollback behavior for the old `wallets.json` version.

### Phase 1: Domain

Locations involved:

- `src/domain/family/index.ts`
- `src/domain/address/index.ts`
- `src/domain/types/network.ts`
- `src/domain/types/tx.ts`
- `src/domain/types/token.ts`
- `src/domain/types/wallet.ts`
- `src/domain/sources/index.ts`
- `src/domain/derivation/index.ts`
- `src/domain/wallet/index.ts`
- `src/domain/errors/index.ts`

Work list:

- [ ] Add `evm` to `ChainFamily` and `FAMILIES`.
- [ ] Register the EVM BIP44 coin type `60`, smallest unit `wei`, address codec, and Ledger metadata.
- [ ] Add EVM address derive, validate, normalize/checksum rules and tests.
- [ ] Restore `NetworkDescriptor` to a discriminated union keyed by `family`.
- [ ] Add `EvmNetworkDescriptor`: `rpcUrl`, decimal chain id, fee model, native currency, and optional explorer/history config.
- [ ] Verify that the canonical id's family and chain id are consistent with the descriptor.
- [ ] Extend the transaction view: gas, gas price, max fee, priority fee, effective gas price, nonce, EVM receipt/status, and other fields.
- [ ] Remove TRON-only naming assumptions from the shared view; when keeping backward-compatible TRON JSON fields, document them explicitly.
- [ ] Confirm the family constraint of the `erc20` token kind and contract-address normalization.
- [ ] Update seed/private-key address derivation, dedup, account projection, and family-detection tests.
- [ ] Complete typed errors for network/chain mismatch, invalid chain id, invalid EVM address, etc.

### Phase 2: Wallet Persistence and Migration

Locations involved:

- `src/adapters/outbound/keystore/index.ts`
- `src/domain/types/wallet.ts`
- `src/domain/wallet/index.ts`
- `src/application/ports/account-store.ts`
- `src/application/ports/wallet-repository.ts`
- `src/application/use-cases/wallet-service.ts`
- `src/adapters/outbound/persistence/backup-writer.ts`
- wallet/keystore tests and migration fixtures

Work list:

- [ ] Raise the `wallets.json` schema version.
- [ ] Handle existing seed/private-key wallets that have only a TRON cached address; adding `evm` to `ChainAddresses` must not invalidate old files.
- [ ] Define the timing for the EVM address's lazy backfill / explicit migration, and the UX when a master password is needed.
- [ ] Ensure migration uses an atomic write and lock, and a failure does not corrupt the original file.
- [ ] Newly created and newly imported seed/private-key wallets generate both a TRON and an EVM address.
- [ ] `derive` for a new account generates addresses for both families.
- [ ] watch-only automatically recognizes TRON/EVM; an EVM address is normalized before storage.
- [ ] Ledger/watch remain single-family sources.
- [ ] list/current/use/rename/delete/backup and address lookup support EVM addresses.
- [ ] Backup metadata includes both known TRON/EVM addresses; for an old wallet not yet backfilled, the field must not be fabricated.
- [ ] Verify behavior for the same private key, a different BIP44 seed path, old-data migration, and dedup.

### Phase 3: Config and NetworkRegistry

Locations involved:

- `src/adapters/outbound/config/builtins.ts`
- `src/adapters/outbound/config/index.ts`
- `src/adapters/outbound/config/yaml-config-document.ts`
- `src/application/ports/network-registry.ts`
- `src/application/use-cases/config-service.ts`
- `src/adapters/inbound/cli/commands/config.ts`
- `src/adapters/inbound/cli/commands/network.ts`

Work list:

- [ ] Add the `evm:1` and the chosen-testnet builtin descriptors.
- [ ] Apply runtime schema validation to a user-defined network, no longer casting directly to `NetworkDescriptor`.
- [ ] Support any valid `evm:<chainId>`, and reject inconsistencies among `family`, id, and chain id.
- [ ] Validate `rpcUrl`, native currency, fee model, aliases, and the optional indexer/explorer fields.
- [ ] When alias support is restored, `NetworkRegistry.resolve()` supports the EVM canonical id, case-insensitive aliases, and the ambiguity check.
- [ ] `config defaultNetwork evm:1`, alias setting, and persistence work.
- [ ] `wallet-cli networks` displays builtin and custom EVM networks, the native symbol, and a safe summary of RPC/fee model/capabilities.
- [ ] Do not leak any API key that the RPC URL may contain in ordinary output; a redaction rule is needed.
- [ ] The network RPC client verifies the remote chain id on first use.

### Phase 4: Application Ports and Shared Services

Locations involved:

- `src/application/ports/chain/evm-gateway.ts` (added)
- `src/application/ports/chain/gateway-provider.ts`
- `src/application/services/evm-confirmation.ts` (added)
- `src/application/services/capability/index.ts` (modified only if per-network capability is needed)

The following shared modules are expected to only gain EVM reuse tests, with no production-code change: `Broadcaster`, `LedgerDevice`,
`TxPipeline`, `SignerResolver`, software/device signer, `TargetResolver`, `transactionMode`.

Work list:

- [ ] Define `EvmGateway`, holding only the read/build/estimate/broadcast capabilities EVM needs.
- [ ] Add `evm` to `ChainGatewayMap`, preserving the typed family lookup.
- [ ] Use EVM fixtures to verify that the shared `Broadcaster`, `TxPipeline`, `Signer`, and `SignStrategy` can carry an EVM transaction directly; the control flow is expected to be unchanged.
- [ ] Implement EVM confirmation normalization, preserving the existing contract of returning a submitted receipt after a `--wait` timeout.
- [ ] Support the legacy and EIP-1559 fee models; a network-specific trait must not be misjudged by a family-wide command capability as supported by all EVM networks.
- [ ] Adjust the capability registration to distinguish "the family has this command" from "this network has an indexer / EIP-1559 / etc. capability".
- [ ] Preserve the invariants: watch-only cannot sign, a wrong-family account is blocked, and dry-run does not decrypt the private key.

### Phase 5: EVM Outbound Adapters

Recommended new locations:

```text
src/adapters/outbound/chain/evm/
├── index.ts
├── provider.ts
├── evm.ts
├── signing-strategy.ts
├── evm-responses.ts
└── history-reader.ts       # added only if history/indexer support is decided
```

Work list:

- [ ] Implement a per-network EVM JSON-RPC client/gateway.
- [ ] Implement native balance, nonce/code, block, transaction, receipt, and fee/gas reads.
- [ ] Implement native/ERC-20 transfer, contract call/send/deploy, estimate, and raw transaction broadcast.
- [ ] Implement software transaction signing and personal-message signing.
- [ ] Validate every RPC response before normalizing, to avoid passing a provider-specific shape into a use case.
- [ ] Uniformly handle errors such as revert reason, replacement/nonce, insufficient funds, underpriced fee, chain mismatch, and timeout.
- [ ] If supporting account history / ABI metadata, add a separate explorer/indexer adapter; do not pretend standard JSON-RPC can provide it.
- [ ] Add EVM adapter unit tests with a mocked transport, not relying on a public RPC.

### Phase 6: Ledger EVM Adapter

Locations involved:

- `src/adapters/outbound/ledger/index.ts` or split into family-specific device adapters
- `src/application/ports/ledger-device.ts`
- `src/application/services/signer/ledger.ts`
- `src/application/services/ledger-account.ts`
- `src/adapters/inbound/cli/commands/wallet.ts`
- `src/bootstrap/composition.ts`
- package dependencies and tsup bundling config

Work list:

- [ ] Add Ethereum Ledger app transport, address, transaction signing, and message signing.
- [ ] The EVM derivation path uses coin type 60, and supports the existing flow for index/path/address scan.
- [ ] `import ledger --app ethereum` appears in the schema, help, interactive choices, and tests.
- [ ] The precheck compares the device address with the cached address.
- [ ] Classify user rejection, wrong app, locked device, wrong seed, and transport error.
- [ ] Update the tsup `noExternal` / native addon config and the Ledger emulator/real-device verification.

### Phase 7: EVM Application Use Cases

Recommended new locations:

```text
src/application/use-cases/evm/
├── account-service.ts
├── token-service.ts
├── transaction-service.ts
├── contract-service.ts
└── block-service.ts
```

Work list:

- [ ] Implement EVM account balance/info/portfolio; handle history per the Section 2 decision.
- [ ] Implement ERC-20 metadata, balance, and token book workflows.
- [ ] Implement native/ERC-20 send, signed raw tx broadcast, status/info.
- [ ] Implement the agreed first-version semantics of contract call/send/deploy/info.
- [ ] Implement EVM block query.
- [ ] Reuse `MessageService`, `TxPipeline`, `TransactionMode`, the token repository, and the price port; do not reuse a use case carrying TRON semantics.
- [ ] All returned shapes use a family-aware, stably-emittable normalized view.

### Phase 8: EVM CLI Command Module

Recommended new locations:

```text
src/adapters/inbound/cli/commands/evm/
├── index.ts
├── account.ts
├── token.ts
├── tx.ts
├── contract.ts
├── message.ts
└── block.ts
```

Shared locations involved:

- `src/adapters/inbound/cli/commands/shared.ts`
- `src/adapters/inbound/cli/schemas/index.ts`
- `src/adapters/inbound/cli/arity/index.ts`
- `src/adapters/inbound/cli/registry/index.ts`
- `src/adapters/inbound/cli/shell/index.ts`
- `src/adapters/inbound/cli/context/index.ts`
- `src/adapters/inbound/cli/command-id.ts`

Work list:

- [ ] Each EVM command registers `family: "evm"`, the logical path, capability, requirements, Zod fields, examples, and formatter.
- [ ] EVM address, hash, hex data, ABI, quantity, gas, fee, nonce, and block identifier use an EVM-specific schema.
- [ ] `tx send` handles both native and ERC-20, but does not expose TRC10/TRC20 flags.
- [ ] The legacy/EIP-1559 command flags, mutual-exclusion conditions, and defaults are driven by a single schema that drives both help and JSON Schema.
- [ ] EVM does not register `stake` commands.
- [ ] Logical routing selects the EVM implementation via `--network evm:<chainId>`; the same path for TRON/EVM does not pollute each other's fields or examples.
- [ ] The command id is stable as `evm.<path>`, e.g. `evm.tx.send`.

### Phase 9: Bootstrap and Family Composition

Locations involved:

- `src/bootstrap/families/evm.ts` (added)
- `src/bootstrap/families/types.ts`
- `src/bootstrap/family-registry.ts`
- `src/bootstrap/composition.ts`
- `src/bootstrap/runner.test.ts`
- `src/adapters/outbound/chain/tron/provider.ts` (may be renamed to a family-neutral gateway-registry location)

Work list:

- [ ] Build the `evmFamily` plugin: meta, gateway factory, sign strategy, use cases, command module.
- [ ] Add `evmFamily` to `FAMILY_REGISTRY`.
- [ ] `familyMap()` is complete for both TRON/EVM factories and signing strategies.
- [ ] The gateway cache is still isolated by canonical network id, not sharing a client across different chains.
- [ ] Capability composition is produced correctly from family commands + per-network traits.
- [ ] Bootstrap tests expect the enabled families to be `tron`, `evm`, and verify the command registration of both.

### Phase 10: Help, Discovery, and Machine Catalog

This phase is a necessary condition for publicly supporting EVM; it must not be treated as a documentation wrap-up.

Locations involved:

- `src/adapters/inbound/cli/help/index.ts`
- `src/adapters/inbound/cli/help/catalog.ts`
- `src/adapters/inbound/cli/globals/index.ts`
- `src/adapters/inbound/cli/registry/index.ts`
- `src/adapters/inbound/cli/commands/network.ts`
- help/golden tests and baselines

Must support and test:

- [ ] `wallet-cli --help`
  - Shows the supported families: TRON, EVM.
  - Explains that the command implementation is selected by `--network`.
  - Has at least one `--network evm:1` example.
  - `stake` is clearly marked TRON-only.
- [ ] `wallet-cli evm --help`
  - Shows the EVM-available command tree, without `stake`.
  - If the `evm` prefix is used only for help/catalog discovery and cannot be used for ordinary execution, it must say so explicitly in the output.
- [ ] `wallet-cli evm tx send --help`
  - Shows only EVM fields, EVM examples, the fee-model explanation, and the EVM address format.
- [ ] `wallet-cli tx send --help`
  - The merged logical help must clearly mark family-specific flags/examples; it must not just take the metadata of the registry's first family.
- [ ] `wallet-cli tx send --network evm:1 --help`
  - Meta parsing must correctly consume the `--network` value and parse it into EVM help; it must not treat `evm:1` as a command positional.
- [ ] `wallet-cli networks --help`
  - Explains the canonical id `evm:<chainId>`, aliases, and the source of custom networks.
- [ ] `wallet-cli --json-schema`
  - The full catalog includes the `evm.*` commands.
  - The top level of the catalog should add an enabled-families and available-networks summary.
- [ ] `wallet-cli evm --json-schema`
  - Emits only EVM chain commands; the schema and examples contain no TRON-only flags.
- [ ] `--json-schema` for each EVM leaf
  - The input schema, requires, capability, examples, and stdin flags are correct.
- [ ] global `--network` description
  - The examples include at least `tron:nile`, `evm:1`, an alias, and the config fallback.
- [ ] unknown/disabled family, unknown EVM network, and family/network mismatch all emit a clear usage error and exit 2.

### Phase 11: Text and JSON Output

Locations involved:

- `src/adapters/inbound/cli/render/index.ts`
- `src/adapters/inbound/cli/render/scalars.ts`
- `src/adapters/inbound/cli/output/envelope.ts`
- `src/adapters/inbound/cli/contracts/envelope.ts`
- formatter/envelope/golden tests

Work list:

- [ ] Add EVM hooks to `FAMILY_RENDER`.
- [ ] Display the native amount per the network `nativeCurrency`, not assuming every EVM network is ETH.
- [ ] EVM transaction info/receipt shows hash, from/to/value, nonce, gas, fee, status, block, and contract address.
- [ ] Both legacy and EIP-1559 fee text render correctly.
- [ ] wallet/list/current/import/derive show both TRON and EVM addresses, and the address is not wrongly abbreviated or mislabeled by family.
- [ ] The `networks` text table shows the EVM chain id, native symbol, and fee model.
- [ ] The JSON envelope keeps `wallet-cli.result.v1` and emits:
  - `command: "evm...."`
  - `chain.family: "evm"`
  - `chain.networkId: "evm:<chainId>"`
  - `chain.chainId: "<chainId>"`
- [ ] All wei, gas, fee, nonce, and block quantities avoid JavaScript number precision loss; JSON uses a stable string rule.
- [ ] error, warning, and progress still obey the stdout/stderr and single-terminal-frame contract.

### Phase 12: Token Book and Price Provider

Locations involved:

- `src/adapters/outbound/tokenbook/builtins.ts`
- `src/adapters/outbound/tokenbook/index.ts`
- `src/application/ports/token-repository.ts`
- `src/adapters/outbound/price/coingecko.ts`
- `src/application/ports/price-provider.ts`

Work list:

- [ ] Add official ERC-20 token entries for the chosen builtin EVM networks; a testnet may keep an empty list.
- [ ] The ERC-20 contract id uses a consistent normalized/checksummed comparison to avoid case-based duplicates.
- [ ] Confirm the token book scope is still `(networkId, accountRef)`, so different EVM chains do not share a list.
- [ ] The CoinGecko native-coin id and asset platform must not be derived from the `evm:` prefix alone; they must be decided by the actual network mapping/config.
- [ ] When a custom EVM network has no price mapping, return null/warning, and do not fail the portfolio command.
- [ ] token price lookup, official/user merge, remove protection, and portfolio tests cover EVM.

### Phase 13: Tests and Quality Gates

#### Unit tests

- [ ] EVM address derive/validate/checksum.
- [ ] BIP44 coin type 60 and seed/private-key address derivation.
- [ ] network descriptor validation, canonical id, arbitrary chain id, aliases, RPC chain mismatch.
- [ ] wallet migration, backfill, dedup, watch/Ledger family pinning.
- [ ] EVM gateway RPC normalization and typed errors.
- [ ] software/Ledger transaction and message signing.
- [ ] legacy/EIP-1559 transaction build, estimate, broadcast, confirmation.
- [ ] ERC-20, contract, block, account, and portfolio use cases.
- [ ] EVM commands, registry routing, target/capability gates, renderers, envelopes.

#### CLI/golden tests

- [ ] root/family/group/leaf `--help`.
- [ ] root/family/leaf `--json-schema`.
- [ ] `networks` text + JSON include `evm:1` and custom `evm:31337`.
- [ ] `config defaultNetwork evm:1` and alias round trip.
- [ ] `--network evm:1` routes to an `evm.*` command id.
- [ ] The same logical command yields a different schema, client, and output under TRON/EVM.
- [ ] wrong-family account, unknown chain, alias collision, unsupported network trait.
- [ ] JSON one-frame, exit `0/1/2`, stderr progress, secret redaction.
- [ ] All old TRON golden tests still pass; the expected output of the root help switches to the new multichain baseline.

#### Integration/live tests

- [ ] Add a local EVM suite, recommended Anvil, covering account, native/ERC-20 send, contract, block, sign-only, broadcast, `--wait`.
- [ ] Add a public EVM testnet smoke suite, using an isolated wallet home and secret source, not logging the private key.
- [ ] Keep the Nile live suite, confirming the EVM changes cause no TRON regression.
- [ ] If supporting Ledger EVM, add Speculos or real-device smoke tests.

#### Required commands

```bash
npm run typecheck
npm run depcruise
npm test
npm run build
npm run test:parity:help
npm run test:live:nile
# new: EVM local integration suite
# new: EVM public-testnet smoke suite
```

### Phase 14: User Documentation and Release

Locations involved:

- `README.md`
- `docs/architecture.md`
- network/config example docs
- command/help baselines
- release notes and migration notes

Work list:

- [ ] Change the README to TRON + EVM, adding `evm:1`, custom chain, wallet, and send examples.
- [ ] Mark the architecture diagram and the family-extension section as EVM-implemented, no longer writing it as a future item.
- [ ] The docs list the builtin networks, canonical id, aliases, custom-network schema, and how to set `defaultNetwork`.
- [ ] Explain that the same wallet has different TRON/EVM derivation paths, and that watch/Ledger are single-family.
- [ ] Explain optional capabilities such as EVM history, contract metadata, price, and Ledger, and their network requirements.
- [ ] Provide the behavior of upgrading from the old wallets schema, the backup recommendation, and the failure-recovery method.
- [ ] Before release, run end-to-end acceptance once each with a brand-new home and an old-version home.

## 4. Master Table of File Changes

| Layer | Modified | Added |
| --- | --- | --- |
| Domain | family, address, network, wallet, tx, token, errors | EVM codec/types (may cohere within existing modules) |
| Application contracts/ports | gateway map, ledger/transaction contracts, capabilities | `evm-gateway.ts` |
| Application services | signer, pipeline, target, capability | `evm-confirmation.ts` |
| Application use cases | shared message/wallet integration | `use-cases/evm/*` |
| Outbound adapters | config, keystore, ledger, tokenbook, price, gateway registry | `chain/evm/*` |
| Inbound CLI | schemas, shell, registry, help, render, output, wallet/network commands | `commands/evm/*` |
| Bootstrap | family types, registry, composition, tests | `families/evm.ts` |
| Tooling | dependencies, tsup, test scripts, baselines | EVM local/live scripts and fixtures |
| Docs | README, architecture, network/config docs | migration/release notes |

## 5. Unacceptable Shortcuts

- Do not merely add `evm` to the union without handling the old-wallet address-cache migration.
- Do not type-cast a custom network directly in `ConfigLoader` without validation.
- Do not add EVM RPC methods into `TronGateway` or create a universal gateway that contains all chains' methods.
- Do not let all EVM networks automatically gain explorer, history, or EIP-1559 capability just because the family has the command.
- Do not let root help, leaf help, and JSON Schema still show only TRON examples.
- Do not hardcode all EVM native currencies as ETH.
- Do not convert a bigint fee/value into an unsafe JavaScript number.
- Do not leak an API key / private key in the RPC URL, an error, a verbose log, the JSON envelope, or a test artifact.
- Do not break TRON command ids, the JSON envelope, exit codes, or the stdout/stderr discipline by adding EVM.

## 6. Final Acceptance Examples

EVM may be declared publicly supported only when all of the following behaviors hold:

```bash
wallet-cli --help
wallet-cli evm --help
wallet-cli evm tx send --help
wallet-cli tx send --network evm:1 --help
wallet-cli --json-schema
wallet-cli evm --json-schema

wallet-cli networks
wallet-cli config defaultNetwork evm:1
wallet-cli account balance --network evm:1
wallet-cli account balance --network evm:31337
wallet-cli tx send --network evm:1 --to 0x... --amount 0.01
wallet-cli token balance --network evm:1 --contract 0x...
wallet-cli contract call --network evm:1 --contract 0x... ...
wallet-cli block --network evm:1
wallet-cli message sign --network evm:1 --message hello
```

Here `evm:31337` must be providable by the user's config; it is not required that every chain id become a builtin network.
