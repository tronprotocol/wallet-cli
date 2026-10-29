import { classifyError, ExecutionError, UsageError } from "../../domain/errors/index.js";

// Prefer the signed transaction’s ID; warn on mismatch without denying a completed broadcast.
export function authoritativeTxId(
  local: string | undefined,
  reported: string | undefined,
  warn: (message: string) => void,
): string {
  const nodeId = reported ?? "";
  if (!local) return nodeId;
  if (nodeId && nodeId.toLowerCase() !== local.toLowerCase()) {
    warn(
      `the node reported transaction id ${nodeId} for a transaction whose id is ${local}; ` +
        "using the id derived from the signed transaction. The node is misreporting or faulty",
    );
  }
  return local;
}

// Reads an existing txID/hash; does not derive or verify it.
export function localTxId(signed: unknown): string | undefined {
  const s = signed as { txID?: unknown; hash?: unknown } | null;
  const id = s?.txID ?? s?.hash;
  return typeof id === "string" && id !== "" ? id : undefined;
}

// Catch only submission: pre-submit failures must not imply a transaction reached the node.
export async function submitWithTxId<T>(
  txId: string | undefined,
  submit: () => Promise<T>,
): Promise<T> {
  try {
    return await submit();
  } catch (error) {
    const classified = classifyError(error);
    if (!txId || !["timeout", "rpc_error", "invalid_node_response"].includes(classified.code)) {
      throw error;
    }
    const ErrorType = classified.kind === "usage" ? UsageError : ExecutionError;
    throw new ErrorType(classified.code, classified, { ...classified.details, txId });
  }
}
