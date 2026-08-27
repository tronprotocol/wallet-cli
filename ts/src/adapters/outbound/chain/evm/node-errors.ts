/**
 * Mapping an EVM node's rejection text to a stable error code.
 *
 * The JSON-RPC spec fixes no codes for these, and clients word them differently, so the match is
 * on substrings of the message. An unmatched rejection keeps the node's own words rather than
 * being forced into a category that might be wrong.
 */
export interface EvmRejection {
  code: string;
  message: string;
}

const PATTERNS: Array<[RegExp, string, string]> = [
  [
    /nonce too low|nonce is too low/i,
    "nonce_too_low",
    "nonce already used; the account has moved on",
  ],
  [
    /nonce too high/i,
    "nonce_too_high",
    "nonce is ahead of the account; an earlier transaction is missing",
  ],
  [
    /insufficient funds/i,
    "insufficient_balance",
    "the account cannot cover the transaction value plus its maximum fee",
  ],
  [
    /replacement transaction underpriced|replacement fee too low/i,
    "replacement_underpriced",
    "replacing a pending transaction needs a higher fee than the one it replaces",
  ],
  [
    /intrinsic gas too low|gas limit (is )?too low|out of gas/i,
    "gas_too_low",
    "the gas limit is below what this transaction needs",
  ],
  [
    /transaction underpriced|fee cap less than block base fee|max fee per gas less than block base fee/i,
    "fee_too_low",
    "the fee is below what the network is currently accepting",
  ],
  [/exceeds block gas limit/i, "gas_limit_exceeded", "the gas limit exceeds the block gas limit"],
];

/** `already known` / `known transaction`: the transaction is ALREADY in the mempool, so the
 *  submission succeeded earlier. Reporting a failure would deny something that already holds. */
export function isAlreadyKnown(message: string): boolean {
  return /already known|known transaction|already exists|transaction already in pool/i.test(
    message,
  );
}

/** the codes this table can produce — the error-code registry checks itself against it, so a new
 *  rule here cannot ship without an entry there. */
export const EVM_REJECTION_CODES: readonly string[] = PATTERNS.map(([, code]) => code);

export function classifyEvmRejection(message: string): EvmRejection | undefined {
  for (const [pattern, code, text] of PATTERNS) {
    if (pattern.test(message)) return { code, message: text };
  }
  return undefined;
}
