import type {
  EvmReceipt,
  EvmUnsignedTx,
  NodeJson,
  UnsignedTx,
} from "../../../../domain/types/index.js";
import type { Erc20Transfer } from "../../../../domain/evm/index.js";
import type { Broadcaster } from "../broadcaster.js";
import type { NativeBalanceReader } from "../native-balance-reader.js";
import type { BaseUnits, Wei } from "../../../../domain/amounts/index.js";

// Scalar quantities are decimal strings; sync objects retain node fields.
export interface EvmGateway extends NativeBalanceReader<Wei>, Broadcaster {
  // Decimal nonce; pending includes unmined transactions.
  getTransactionCount(address: string, block?: "latest" | "pending"): Promise<string>;
  // Hex bytecode; 0x means no code.
  getCode(address: string): Promise<string>;
  // Decimal height.
  getBlockNumber(): Promise<string>;
  // Null when the node has no such block; accepts a decimal height or tag.
  getBlock(numberOrTag?: string): Promise<EvmBlockView | null>;
  // Node-reported decimal chain ID.
  chainId(): Promise<string>;
  // True while the node reports sync progress.
  syncing(): Promise<boolean>;
  // Decimal peer count; hosted endpoints may refuse.
  peerCount(): Promise<string>;
  clientVersion(): Promise<string>;
  // Zero base fee is distinct from absence and must retain EIP-1559 handling.
  feeData(): Promise<{ baseFeeWei?: Wei; gasPriceWei: Wei; suggestedPriorityWei?: Wei }>;
  // Decimal gas units.
  estimateGas(tx: Record<string, unknown>): Promise<string>;
  encodeFunctionCall(signature: string, params: Array<{ type: string; value: unknown }>): string;
  // Creation bytecode plus ABI-encoded constructor arguments.
  encodeDeploy(bytecode: string, args: DeployConstructorArgs): string;
  // CREATE address from sender and nonce.
  contractAddressFor(from: string, nonce: string): string;
  encodeErc20Transfer(to: string, rawAmount: BaseUnits): string;
  // Transaction hex for tx sign / tx broadcast.
  encodeTransactionHex(tx: unknown): string;
  // Decodes a serialized transaction without contacting the node.
  decodeRawTransaction(hex: string): EvmRawTransaction;
  // Decimal chain id an unsigned transaction names; undefined when it names none.
  transactionChainId(tx: UnsignedTx): string | undefined;
  // alreadyKnown means the signed transaction is already in the mempool.
  sendRawTransaction(raw: string): Promise<{ hash?: string; alreadyKnown?: boolean }>;
  // Null when the node has no record of the hash.
  getTransactionByHash(hash: string): Promise<EvmTxView | null>;
  // Normalized mined receipt, or null while pending; success reflects execution status.
  getTransactionReceipt(hash: string, signal?: AbortSignal): Promise<EvmReceipt | null>;
  // Input and result are hex DATA.
  call(to: string, data: string): Promise<string>;
  // Returns raw hex DATA.
  callFunction(
    contract: string,
    signature: string,
    params: Array<{ type: string; value: unknown }>,
  ): Promise<string>;
  getErc20Balance(contract: string, owner: string): Promise<BaseUnits>;
  // Unavailable metadata fields are omitted, not defaulted.
  getErc20Metadata(
    contract: string,
  ): Promise<{ symbol?: string; decimals?: number; name?: string }>;
}

// Node JSON passed through verbatim for display; inner layers do not branch on it.
export type EvmRpcJson = NodeJson;

// A mined block; gas quantities are decimal strings.
export interface EvmBlockView {
  readonly number: number;
  // Unix seconds.
  readonly timestamp: number;
  readonly hash?: string;
  readonly parentHash?: string;
  // Absent when the node omits the transaction list.
  readonly transactionCount?: number;
  readonly gasUsed?: string;
  readonly gasLimit?: string;
  // Absent before EIP-1559.
  readonly baseFeeWei?: string;
  readonly raw: EvmRpcJson;
}

// A transaction as the node reports it, mined or pending.
export interface EvmTxView {
  // EIP-55 sender.
  readonly from: string;
  // EIP-55 recipient; absent for a contract creation.
  readonly to?: string;
  readonly valueWei: string;
  // Hex calldata; "0x" when empty.
  readonly input: string;
  readonly nonce?: number;
  // Present when input is an ERC-20 transfer call.
  readonly erc20Transfer?: Erc20Transfer;
  readonly raw: EvmRpcJson;
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
  readonly transaction: EvmUnsignedTx;
}

// Types come from the ABI, an explicit signature, or the types given with each value; never
// inferred from values.
export type DeployConstructorArgs =
  | { source: "none" }
  | { source: "abi"; abi: unknown; values: unknown[] }
  | { source: "signature"; signature: string; values: unknown[] }
  | { source: "typed-params"; types: string[]; values: unknown[] };
