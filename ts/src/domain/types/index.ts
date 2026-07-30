/**
 * SharedTypes barrel — the single home for cross-layer domain types and interfaces.
 *
 * No runtime/value code lives here. Implementations live in their feature layers and
 * `implements` the interfaces declared here, so any module can depend on the type
 * without creating a runtime dependency. Import shared contracts from this module so the
 * split below is organizational only.
 *
 * Layout:
 *   network.ts   — identity & network: NetworkId/Descriptor, Config, capabilities
 *   wallet.ts    — wallet data persisted in wallets.json (Source/Wallet/…)
 *   token.ts     — token address-book persisted in tokens.json
 *   keystore.ts  — encrypted secret-at-rest shapes
 *   tx.ts        — crypto / signing / tx / rpc value aliases, tx outcome, signing ports,
 *                  per-command typed text outputs
 *   runtime.ts   — streams / secrets / network registry service interfaces
 *   command.ts   — ExecutionContext, CommandDefinition, ChainModule
 *   envelope.ts  — result/error envelopes, progress events, global runtime flags
 *
 * ChainFamily (type + value enum) lives with the family registry and is re-exported here.
 */
export type { ChainFamily } from "../family/index.js";
export type { TypedDataField, TypedDataPayload } from "../typed-data/index.js";

export * from "./network.js";
export * from "./wallet.js";
export * from "./token.js";
export * from "./keystore.js";
export * from "./tx.js";
export * from "./primitives.js";
