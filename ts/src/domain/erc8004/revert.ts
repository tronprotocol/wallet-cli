import { Interface } from "ethers";
import { ExecutionError } from "../errors/index.js";
const errors = new Interface([
  "error Error(string)",
  "error ERC721NonexistentToken(uint256 tokenId)",
  "error ERC721InsufficientApproval(address operator,uint256 tokenId)",
  "error ERC721InvalidApprover(address approver)",
]);

/** Classify explicit contract evidence; an unrelated RPC failure stays unchanged. */
export function agentWriteError(error: unknown): unknown {
  const value = error as { details?: { revertData?: unknown }; data?: unknown } | null;
  const data = value?.details?.revertData ?? value?.data;
  if (typeof data !== "string") return error;
  try {
    const decoded = errors.parseError(data.startsWith("0x") ? data : `0x${data}`);
    if (decoded?.name === "ERC721NonexistentToken")
      return new ExecutionError("agent_not_found", "the requested Agent does not exist");
    if (
      ["ERC721InsufficientApproval", "ERC721InvalidApprover"].includes(decoded?.name ?? "") ||
      (decoded?.name === "Error" && decoded.args[0] === "Not authorized")
    )
      return new ExecutionError(
        "not_authorized",
        "the selected account is not authorized for this Agent operation",
      );
  } catch {
    /* Preserve undecodable and unrelated errors. */
  }
  return error;
}
