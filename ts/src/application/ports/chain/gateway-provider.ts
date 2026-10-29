import type { ChainFamily } from "../../../domain/family/index.js";
import type { NetworkDescriptor, UnsignedTx } from "../../../domain/types/index.js";
import type { Broadcaster } from "./broadcaster.js";
import type { TronGateway } from "./tron-gateway.js";

export interface NativeBalanceReader {
  getNativeBalance(address: string): Promise<string>;
}

// Scalar quantities are decimal strings; block, transaction, and sync objects retain node fields.
export interface EvmGateway extends NativeBalanceReader, Broadcaster {
  // Decimal nonce; pending includes unmined transactions.
  getTransactionCount(address: string, block?: "latest" | "pending"): Promise<string>;
  // Hex bytecode; 0x means no code.
  getCode(address: string): Promise<string>;
  // Decimal height.
  getBlockNumber(): Promise<string>;
  // Raw block with hex quantities and epoch seconds, or null; accepts a decimal height or tag.
  getBlock(numberOrTag?: string): Promise<unknown>;
  // Node-reported decimal chain ID.
  chainId(): Promise<string>;
  // False when synced; otherwise raw node progress.
  syncing(): Promise<unknown>;
  // Decimal peer count; hosted endpoints may refuse.
  peerCount(): Promise<string>;
  clientVersion(): Promise<string>;
  // Decimal wei; zero base fee is distinct from absence and must retain EIP-1559 handling.
  feeData(): Promise<{ baseFeeWei?: string; gasPriceWei: string; suggestedPriorityWei?: string }>;
  // Decimal gas units.
  estimateGas(tx: Record<string, unknown>): Promise<string>;
  encodeFunctionCall(signature: string, params: Array<{ type: string; value: unknown }>): string;
  // Creation bytecode plus ABI-encoded constructor arguments.
  encodeDeploy(bytecode: string, args: DeployConstructorArgs): string;
  // CREATE address from sender and nonce.
  contractAddressFor(from: string, nonce: string): string;
  // rawAmount is in token base units.
  encodeErc20Transfer(to: string, rawAmount: string): string;
  // Transaction hex for tx sign / tx broadcast.
  encodeTransactionHex(tx: unknown): string;
  // Decodes a serialized transaction without contacting the node.
  decodeRawTransaction(hex: string): EvmRawTransaction;
  // Decimal chain id an unsigned transaction names; undefined when it names none.
  transactionChainId(tx: UnsignedTx): string | undefined;
  // alreadyKnown means the signed transaction is already in the mempool.
  sendRawTransaction(raw: string): Promise<{ hash?: string; alreadyKnown?: boolean }>;
  // Raw node transaction, or null when unknown.
  getTransactionByHash(hash: string): Promise<Record<string, unknown> | null>;
  // Normalized mined receipt, or null while pending; success reflects execution status.
  getTransactionReceipt(hash: string): Promise<Record<string, unknown> | null>;
  // Input and result are hex DATA.
  call(to: string, data: string): Promise<string>;
  // Returns raw hex DATA.
  callFunction(
    contract: string,
    signature: string,
    params: Array<{ type: string; value: unknown }>,
  ): Promise<string>;
  // Decimal token base units.
  getErc20Balance(contract: string, owner: string): Promise<string>;
  // Unavailable metadata fields are omitted, not defaulted.
  getErc20Metadata(
    contract: string,
  ): Promise<{ symbol?: string; decimals?: number; name?: string }>;
}

// Quantities are decimal strings.
export interface EvmRawTransaction {
  // "0" when the transaction names no chain.
  readonly chainId: string;
  readonly signed: boolean;
  // Checksummed signer; present only when signed.
  readonly from?: string;
  // Absent for a contract creation.
  readonly to?: string;
  readonly nonce: number;
  readonly gasLimit: string;
  // EIP-1559 transactions only.
  readonly maxFeePerGasWei?: string;
  // Legacy and EIP-2930 transactions only.
  readonly gasPriceWei?: string;
  readonly valueWei: string;
  // Hash and 0x hex of the signed serialization; present only when signed.
  readonly hash?: string;
  readonly serialized?: string;
  // JSON form, as signers and command output take it.
  readonly transaction: UnsignedTx;
}

// Types come from the ABI or explicit signature, never inferred from values.
// flag identifies the signature option in encoding errors.
export type DeployConstructorArgs =
  | { source: "none" }
  | { source: "abi"; abi: unknown; values: unknown[] }
  | { source: "signature"; signature: string; values: unknown[]; flag: string };

export interface ChainGatewayMap {
  tron: TronGateway;
  evm: EvmGateway;
}

export type AnyChainGateway = ChainGatewayMap[ChainFamily];

export interface ChainGatewayProvider {
  client(network: NetworkDescriptor): NativeBalanceReader;
  get<F extends ChainFamily>(network: NetworkDescriptor, family: F): ChainGatewayMap[F];
}
