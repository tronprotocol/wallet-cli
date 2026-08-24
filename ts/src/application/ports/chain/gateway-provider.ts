import type { ChainFamily } from "../../../domain/family/index.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { Broadcaster } from "./broadcaster.js";
import type { TronGateway } from "./tron-gateway.js";

export interface NativeBalanceReader {
  getNativeBalance(address: string): Promise<string>;
}

/**
 * The EVM gateway — the JSON-RPC reads the family's commands need.
 *
 * Every method speaks the CLI's vocabulary, not the wire's: QUANTITY values arrive as decimal
 * strings and DATA stays hex (EIP-1474). Nothing above this port sees a `0x` quantity.
 * Writes (`eth_sendRawTransaction`, gas estimation) land with the transaction commands.
 */
export interface EvmGateway extends NativeBalanceReader, Broadcaster {
  /** the account's nonce, as a decimal string; `pending` includes our own unmined txs. */
  getTransactionCount(address: string, block?: "latest" | "pending"): Promise<string>;
  /** deployed bytecode as hex; `0x` for an account with no code. */
  getCode(address: string): Promise<string>;
  /** head height as a decimal string. */
  getBlockNumber(): Promise<string>;
  /** the node's block object verbatim (hex quantities, seconds); null when absent.
   *  Takes a decimal height or a block tag ("latest", "finalized", "safe"). */
  getBlock(numberOrTag?: string): Promise<unknown>;
  /** false when synced, else the node's progress object. */
  syncing(): Promise<unknown>;
  /** connected peers; hosted endpoints commonly refuse this call. */
  peerCount(): Promise<string>;
  clientVersion(): Promise<string>;
  /** base fee, gas price and suggested tip as decimal wei; a ZERO base fee is reported as "0",
   *  which is distinct from an absent one (BSC reports zero and is still EIP-1559). */
  feeData(): Promise<{ baseFeeWei?: string; gasPriceWei: string; suggestedPriorityWei?: string }>;
  /** the node's gas estimate for a transaction, as a decimal string. */
  estimateGas(tx: Record<string, unknown>): Promise<string>;
  /** calldata for a `{type, value}` call, encoded without sending it. */
  encodeFunctionCall(signature: string, params: Array<{ type: string; value: unknown }>): string;
  /** deployment calldata: creation bytecode plus the constructor's ABI-encoded arguments. */
  encodeDeploy(bytecode: string, abiJson: string, params: unknown[]): string;
  /** where a CREATE deployment will land, from the sender and nonce alone. */
  contractAddressFor(from: string, nonce: string): string;
  /** calldata for an ERC-20 `transfer`; the amount is already in the token's base units. */
  encodeErc20Transfer(to: string, rawAmount: string): string;
  /** serialise a transaction to the hex `tx sign`/`tx broadcast` exchange. */
  encodeTransactionHex(tx: unknown): string;
  /** submit a signed transaction; `alreadyKnown` means it was in the mempool already. */
  sendRawTransaction(raw: string): Promise<{ hash?: string; alreadyKnown?: boolean }>;
  /** the node's transaction object, or null when this node has no record of the hash. */
  getTransactionByHash(hash: string): Promise<Record<string, unknown> | null>;
  /** the mined receipt, or null while pending. `success` comes from status, not from existing. */
  getTransactionReceipt(hash: string): Promise<Record<string, unknown> | null>;
  /** a read-only contract call; `data` and the result are hex DATA. */
  call(to: string, data: string): Promise<string>;
  /** a read-only call named by signature with `{type, value}` params; result is raw hex DATA. */
  callFunction(
    contract: string,
    signature: string,
    params: Array<{ type: string; value: unknown }>,
  ): Promise<string>;
  /** ERC-20 balance as a decimal base-unit string. */
  getErc20Balance(contract: string, owner: string): Promise<string>;
  /** best-effort ERC-20 metadata; a field the contract does not answer is absent, never defaulted. */
  getErc20Metadata(contract: string): Promise<{ symbol?: string; decimals?: number; name?: string }>;
}

/** Family-keyed extension point. Add each new family gateway here without widening other ports. */
export interface ChainGatewayMap {
  tron: TronGateway;
  evm: EvmGateway;
}

export type AnyChainGateway = ChainGatewayMap[ChainFamily];

export interface ChainGatewayProvider {
  client(network: NetworkDescriptor): NativeBalanceReader;
  get<F extends ChainFamily>(network: NetworkDescriptor, family: F): ChainGatewayMap[F];
}
