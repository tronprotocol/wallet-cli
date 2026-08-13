import type { TronTransactionArtifact, UnsignedTx } from "../../../domain/types/index.js";
import { ChainError } from "../../../domain/errors/index.js";
import { decodeOperations } from "../../../domain/permission/index.js";
import { addressCodec } from "../../../domain/family/index.js";
import type { TronGateway, TronSignWeight } from "../../ports/chain/tron-gateway.js";
import { assertNotExpired, transactionContract } from "./transaction-artifact.js";

function uniqueAddresses(addresses: readonly string[], field: string): Set<string> {
  const set = new Set(addresses);
  if (set.size !== addresses.length
    || addresses.some((address) => !addressCodec("tron").validate(address))) {
    throw new ChainError("provider_error", `TRON node returned invalid or duplicate addresses in ${field}`);
  }
  return set;
}

function assertPermissionConsistent(
  transaction: TronTransactionArtifact,
  weight: TronSignWeight,
  approved: string[],
): NonNullable<TronSignWeight["permission"]> {
  const acceptedCodes = new Set(["ENOUGH_PERMISSION", "NOT_ENOUGH_PERMISSION"]);
  if (weight.resultCode && !acceptedCodes.has(weight.resultCode)) {
    throw new ChainError(
      weight.resultCode.includes("PERMISSION") ? "not_authorized" : "invalid_transaction",
      weight.message || `node rejected transaction signatures (${weight.resultCode})`,
    );
  }
  if (!weight.permission) {
    const code = weight.resultCode || "unknown";
    throw new ChainError(
      code.includes("PERMISSION") ? "not_authorized" : "invalid_transaction",
      weight.message || `node could not resolve transaction permission (${code})`,
    );
  }
  const permissionId = transactionContract(transaction).Permission_id ?? 0;
  if (weight.permission.id !== permissionId) {
    throw new ChainError("provider_error", "node resolved a different permission id for the transaction");
  }
  const fromWeight = uniqueAddresses(weight.approvedList, "getsignweight.approved_list");
  const fromApproved = uniqueAddresses(approved, "getapprovedlist.approved_list");
  if (fromWeight.size !== fromApproved.size || [...fromWeight].some((address) => !fromApproved.has(address))) {
    throw new ChainError("provider_error", "getsignweight and getapprovedlist returned different approvals");
  }
  const keys = new Map(weight.permission.keys.map((key) => [key.address, key.weight]));
  let computedWeight = 0;
  for (const address of fromApproved) {
    const keyWeight = keys.get(address);
    if (keyWeight === undefined) {
      throw new ChainError("provider_error", "node approved a signer outside the selected permission group");
    }
    computedWeight += keyWeight;
  }
  if (computedWeight !== weight.currentWeight) {
    throw new ChainError("provider_error", "node current_weight does not match approved signer weights");
  }

  const contractType = transactionContract(transaction).type;
  if (permissionId >= 2) {
    if (!weight.permission.operationsHex) {
      throw new ChainError("provider_error", "active permission is missing its operations bitmap");
    }
    let operations: ReturnType<typeof decodeOperations>;
    try {
      operations = decodeOperations(weight.permission.operationsHex);
    } catch {
      throw new ChainError("provider_error", "active permission has a malformed operations bitmap");
    }
    if (!operations.operations.includes(contractType)) {
      throw new ChainError("not_authorized", `permission ${permissionId} does not allow ${contractType}`);
    }
  }
  return weight.permission;
}

export async function authorizationState(
  gateway: TronGateway,
  transaction: TronTransactionArtifact,
) {
  const [weight, approved] = await Promise.all([
    gateway.getSignWeight(transaction),
    gateway.getApprovedList(transaction),
  ]);
  const permission = assertPermissionConsistent(transaction, weight, approved);
  return { weight, approved, permission };
}

/** Validate permission membership before decrypting a software key or opening Ledger UI. */
export async function assertTronSignerAuthorized(
  gateway: TronGateway,
  transaction: UnsignedTx,
  signerAddress: string,
  now = Date.now(),
): Promise<void> {
  const artifact = transaction as TronTransactionArtifact;
  assertNotExpired(artifact, now);
  const { approved, permission } = await authorizationState(gateway, artifact);
  if (!permission.keys.some((key) => key.address === signerAddress)) {
    throw new ChainError("not_authorized", "selected signer is not a key in the transaction permission group");
  }
  if (approved.includes(signerAddress)) {
    throw new ChainError("already_signed", "selected signer has already approved this transaction");
  }
}

/**
 * Shared transaction-construction hooks. Permission approval checks belong to explicit
 * multi-signature workflows so ordinary signing does not depend on online approval endpoints.
 */
export function tronTransactionHooks(gateway: TronGateway) {
  return {
    prepare: (transaction: UnsignedTx, options: { permissionId: number; expiration?: number }) =>
      gateway.prepareTransaction(transaction, options),
    artifact: (transaction: UnsignedTx) => gateway.encodeTransactionHex(transaction),
  };
}
