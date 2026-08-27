/**
 * Node rejection messages → stable error codes.
 *
 * A rejected broadcast otherwise surfaces as `transaction_rejected` carrying the node's own text,
 * which reads fine for a human but gives an agent nothing to branch on. This is the narrow,
 * anchored allowlist ADR-0006 describes: only messages whose meaning we are sure of, and any
 * unrecognised message falls through to `transaction_rejected` unchanged.
 *
 * Anchoring matters. A loose substring match (`/insufficient/`) is how you end up confidently
 * attaching the wrong code to a message java-tron reworded — and the fallback already behaves
 * correctly, so a missed match costs only specificity, never accuracy.
 */

interface NodeRejection {
  code: string;
  /** replaces the node's text when we can say something more useful than it did. */
  message?: string;
}

const RULES: Array<{ match: RegExp; rejection: NodeRejection }> = [
  {
    // ExchangeWithdrawActuator: the proportional quotient must be exact to within 0.01%.
    match: /^Not precise enough$/i,
    rejection: {
      code: "precision_loss",
      message:
        "the amount does not divide this pair's reserve ratio precisely enough; round it and try again",
    },
  },
  {
    // ExchangeTransactionActuator: the realised return fell below the floor we sent as `expected`.
    match: /token required must greater than expected/i,
    rejection: {
      code: "slippage_exceeded",
      message:
        "the trade would have returned less than the floor you set, so the chain reverted it; only bandwidth was spent",
    },
  },
  {
    // Manager.pushTransaction refuses this contract type outright until the TIP-836 hardening
    // proposal (`getAllowHardenExchangeCalculation`) is active. Unset on mainnet and Nile as of
    // 2026-08. Creating a pair and moving its liquidity are unaffected — only trading.
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

/** the codes this table can produce; see EVM_REJECTION_CODES. */
export const TRON_REJECTION_CODES: readonly string[] = RULES.map((r) => r.rejection.code);

/**
 * java-tron wraps an actuator's message in its own envelope before it reaches the wire, e.g.
 * `Contract validate error : ExchangeTransactionContract is rejected`. Strip that wrapper so the
 * rules can stay anchored to the actuator's actual wording instead of matching loosely.
 */
const ENVELOPE =
  /^(?:Contract validate error\s*:\s*|Contract validate error\s*|contract validate error\s*:\s*)/i;

/** the code and message a node rejection should surface as, or undefined to keep the default. */
export function classifyNodeRejection(reason: string): NodeRejection | undefined {
  const text = reason.trim().replace(ENVELOPE, "").trim();
  return RULES.find((rule) => rule.match.test(text))?.rejection;
}
