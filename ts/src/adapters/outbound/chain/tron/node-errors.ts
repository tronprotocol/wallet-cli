interface NodeRejection {
  code: string;
  message?: string;
}

const RULES: Array<{ match: RegExp; rejection: NodeRejection }> = [
  {
    // Exchange withdrawal requires the reserve-ratio quotient to be precise within 0.01%.
    match: /^Not precise enough$/i,
    rejection: {
      code: "precision_loss",
      message:
        "the amount does not divide this pair's reserve ratio precisely enough; round it and try again",
    },
  },
  {
    match: /token required must greater than expected/i,
    rejection: {
      code: "slippage_exceeded",
      message:
        "the trade would have returned less than the floor you set, so the chain reverted it; only bandwidth was spent",
    },
  },
  {
    match: /^ExchangeTransactionContract is rejected$/i,
    rejection: {
      code: "exchange_trading_disabled",
      message:
        "this network is not accepting Bancor trades: java-tron rejects ExchangeTransactionContract " +
        "until the TIP-836 hardening proposal (getAllowHardenExchangeCalculation) is activated. " +
        "exchange create / inject / withdraw still work.",
    },
  },
];

export const TRON_REJECTION_CODES: readonly string[] = [
  ...RULES.map((r) => r.rejection.code),
  "tx_expired",
];

// java-tron returns these after the transaction may already sit in the node's pool or on chain:
// OTHER_ERROR is its catch-all, NOT_ENOUGH_EFFECTIVE_CONNECTION follows the local push, and
// DUP_TRANSACTION_ERROR means the node already holds this transaction id.
const OUTCOME_UNKNOWN_CODES: ReadonlySet<string> = new Set([
  "OTHER_ERROR",
  "NOT_ENOUGH_EFFECTIVE_CONNECTION",
  "DUP_TRANSACTION_ERROR",
]);

export function isOutcomeUnknownBroadcastCode(nodeCode: string | undefined): boolean {
  return nodeCode !== undefined && OUTCOME_UNKNOWN_CODES.has(nodeCode);
}

// Strip java-tron's validation wrapper before matching the actuator message.
const ENVELOPE =
  /^(?:Contract validate error\s*:\s*|Contract validate error\s*|contract validate error\s*:\s*)/i;

// Return undefined for unrecognized rejections so callers retain their default error.
export function classifyNodeRejection(
  reason: string,
  nodeCode?: string | number,
): NodeRejection | undefined {
  if (
    nodeCode === "TRANSACTION_EXPIRATION_ERROR" ||
    nodeCode === 8 ||
    reason.trim() === "TRANSACTION_EXPIRATION_ERROR"
  ) {
    return { code: "tx_expired", message: "transaction expired; rebuild and sign it again" };
  }
  const text = reason.trim().replace(ENVELOPE, "").trim();
  return RULES.find((rule) => rule.match.test(text))?.rejection;
}
