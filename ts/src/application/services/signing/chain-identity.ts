import type {
  NetworkDescriptor,
  TypedDataPayload,
  UnsignedTx,
} from "../../../domain/types/index.js";
import { ChainError, TransportError } from "../../../domain/errors/index.js";
import { parseChainId } from "../../../domain/family/chain-id.js";
import type { TronGateway } from "../../ports/chain/tron/tron-gateway.js";

function mismatch(subject: string, declared: string, network: NetworkDescriptor): ChainError {
  return new ChainError(
    "chain_id_mismatch",
    `${subject} chain ${declared}, but ${network.id} is chain ${network.chainId}`,
  );
}

// A domain without chainId is not bound to a chain and is signed as is.
export function assertTypedDataChain(payload: TypedDataPayload, network: NetworkDescriptor): void {
  const declared = payload.domain.chainId;
  if (declared === undefined) return;
  const chainId = parseChainId(declared);
  if (chainId === undefined) {
    throw new ChainError(
      "chain_id_mismatch",
      `typed data domain.chainId ${String(declared)} is not an integer chain id`,
    );
  }
  if (chainId !== BigInt(network.chainId)) {
    throw mismatch("this typed data is for", chainId.toString(), network);
  }
}

// A transaction without a chain id is valid on every EVM chain, so it is refused.
export function assertEvmTransactionChain(
  chainId: string | undefined,
  network: NetworkDescriptor,
): void {
  if (chainId === undefined) {
    throw new ChainError(
      "chain_id_mismatch",
      `this transaction names no chain id, so it is valid on every EVM chain; ${network.id} is chain ${network.chainId}`,
    );
  }
  if (BigInt(chainId) !== BigInt(network.chainId)) {
    throw mismatch("this transaction is built for", chainId, network);
  }
}

// TRON signatures carry no chain id; the reference block (TAPOS) binds a transaction to its chain.
export async function assertTronReferenceBlock(
  gateway: TronGateway,
  network: NetworkDescriptor,
  transaction: UnsignedTx,
): Promise<void> {
  const status = await gateway.referenceBlockStatus(transaction);
  if (status === "held") return;
  if (status === "not-reached") {
    throw new TransportError(
      "rpc_error",
      `the ${network.id} node has not yet seen this transaction's reference block; retry shortly or use a node that is in sync`,
    );
  }
  throw new ChainError(
    "chain_id_mismatch",
    `this transaction's reference block is not on ${network.id}; it was built for another chain`,
  );
}
