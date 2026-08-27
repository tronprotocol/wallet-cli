/**
 * `approve(address,uint256)` in the terms a person can check.
 *
 * This is the one call where the number on the command line is unreadable: an allowance is a
 * `uint256` scaled by the token's own decimals, and the maximum is 78 digits. Approving is also
 * the operation that most often costs people their funds, so the receipt states WHO was approved
 * and FOR HOW MUCH rather than leaving the caller to check their own arithmetic (§7.2).
 *
 * Family-neutral because the danger is: TRC20 and ERC-20 share this method, this hazard, and this
 * unreadable argument. Only two things differ per family — how a spender address is written, and
 * where the token's decimals come from — so both arrive as parameters.
 *
 * Note this decodes NOTHING: the caller typed the method signature and its arguments, so the
 * meaning is already stated. That is what separates it from `tx info`, which deliberately refuses
 * to guess at calldata it was not told the shape of.
 */

/** `2^256-1`: the "no expiry, no ceiling" allowance every dapp asks for. */
const MAX_UINT256 = (1n << 256n) - 1n;

/** a signature with its spacing normalised, so `approve(address, uint256)` matches too. */
function normalizeSignature(signature?: string): string {
  return (signature ?? "").replace(/\s+/g, "");
}

export interface ApproveContext {
  method?: string;
  params?: Array<{ value?: unknown }>;
  /** the token's decimals and symbol; may fail — labelling is not worth failing the call over. */
  metadata: () => Promise<{ decimals?: number; symbol?: string }>;
  /** the spender address in the family's own display form (TRON hex → base58, EVM as-is). */
  displayAddress?: (value: string) => string;
  /** base units → whole units, the family's own scaling. */
  fromBaseUnits: (raw: string, decimals: number) => string;
}

/**
 * The `spender` / `allowance` fields for an approve call, or nothing at all for any other method.
 *
 * `unlimited` short-circuits before the metadata read: the 78-digit form tells the reader only
 * that the number is long, and no decimals can make it readable.
 */
export async function approveRows(ctx: ApproveContext): Promise<Record<string, unknown>> {
  if (normalizeSignature(ctx.method) !== "approve(address,uint256)") return {};
  const spenderRaw = ctx.params?.[0]?.value;
  const raw = ctx.params?.[1]?.value;
  if (typeof spenderRaw !== "string" || raw === undefined) return {};
  let amount: bigint;
  try {
    amount = BigInt(String(raw));
  } catch {
    return {};
  }
  const spender = (ctx.displayAddress ?? ((v: string) => v))(spenderRaw);
  if (amount === MAX_UINT256) return { spender, allowance: "unlimited" };

  const meta = await ctx.metadata().catch(() => ({}) as { decimals?: number; symbol?: string });
  return {
    spender,
    // Unreadable decimals degrade to the base-unit integer rather than failing the call: our
    // ability to LABEL the amount has no bearing on the approval itself.
    allowance:
      meta.decimals === undefined
        ? amount.toString(10)
        : ctx.fromBaseUnits(amount.toString(10), meta.decimals),
    ...(meta.decimals === undefined ? {} : { allowanceDecimals: meta.decimals }),
    // Labels the amount — "1 USDC" rather than a bare 1.
    ...(typeof meta.symbol === "string" && meta.symbol !== "" ? { token: meta.symbol } : {}),
  };
}
