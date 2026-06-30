import type { z } from "zod";

/** TRC20 contract XOR TRC10 asset id; exactly one selector is required. */
export function tokenSelector(
  value: { contract?: string; assetId?: string },
  context: z.RefinementCtx,
): void {
  const count = [value.contract, value.assetId]
    .filter((candidate) => candidate !== undefined).length;
  if (count !== 1) {
    context.addIssue({
      code: "custom",
      path: ["contract"],
      message: "exactly one of --contract (TRC20) or --asset-id (TRC10) is required",
    });
  }
}

