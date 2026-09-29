/**
 * The Universal Router call, checked against the swap it is supposed to be.
 *
 * The calldata is built by the SDK from a route object, and it is the only place the protections
 * actually live: the minimum output, the recipient and the deadline are ABI words inside
 * `execute(bytes,bytes[],uint256)`, not fields anyone can read off the plan. Two measured facts
 * make checking them necessary rather than ceremonial:
 *
 * - The route's own `amountOutMinimum` field comes back EQUAL to `amountOut` even when slippage was
 *   requested. Reading it would tell a caller there is no floor when there is one. The real floor
 *   is applied while the calldata is built, from `slippageBips`.
 * - The fee limit defaults to 500000000 SUN — 500 TRX — when it is not set.
 *
 * WHAT THIS PROVES, and what it does not. The scalar checks are exact: the target, the selector,
 * the call value, the fee limit and the deadline are single values and are compared directly.
 * Everything inside the encoded inputs — the minimum, the input amount, the recipient, and the
 * permit's amount and expiration — is checked by CONTAINMENT: the word must appear among the
 * calldata's ABI words. Their POSITION depends on which commands the route compiled to, and pinning
 * positions would make an ordinary V2/V3/V4 route mix fail as if it were an attack.
 *
 * So containment proves our figures reached the calldata; it does not prove no other figure is used
 * beside them. Two limits are known and were found by tests that PASSED when they should not have:
 *
 * - A recipient swapped for another address the call already mentions would not be caught. The
 *   first version of that test used the input token's own address and passed, because the input
 *   token is genuinely in the calldata. Only a recipient absent entirely is caught.
 * - Containment is meaningless for a value small enough to occur by accident. The word `1` is in
 *   almost any encoding, as an array length or a flag. Amounts, timestamps and addresses are
 *   specific enough; small integers are not.
 *
 * It catches the failure that actually happens — an encoder that stops applying the floor, or
 * applies it to a number other than the one we published — and, for the permit, it is paired with a
 * check that an unlimited grant is ABSENT, which is the one substitution worth naming by value.
 */
import { tronHexAddress } from "../address/index.js";
import { ChainError } from "../errors/index.js";

const SELECTOR = "execute(bytes,bytes[],uint256)";

export interface RouterCallExpectation {
  /** The Universal Router, from the chain's own configuration. */
  readonly router: string;
  /** Base units of the input token. */
  readonly amountIn: string;
  /** The floor we published and intend to enforce, base units of the output token. */
  readonly minimumOut: string;
  /** Where the output must go. A swap that succeeds and pays somebody else is the worst outcome. */
  readonly recipient: string;
  /** TRX in travels as the call's value; a token in must carry none. */
  readonly nativeIn: boolean;
  readonly feeLimit: string;
  /** Latest acceptable deadline, unix seconds. */
  readonly notAfter: number;
  readonly now: number;
  /**
   * The permit the caller signed, when this swap carries one.
   *
   * Checked here as well as before signing, because this is the first point at which the grant and
   * the calldata are the same object: the guard over the typed data proves what was signed, and
   * this proves that THAT is what the transaction carries. An unlimited grant appearing between
   * the two would otherwise be invisible.
   */
  readonly permit?: { readonly amount: string; readonly expiration: string };
}

/** What the call turned out to be, for the receipt. */
export interface RouterCallFacts {
  readonly target: string;
  readonly callValue: string;
  readonly feeLimit: string;
  readonly deadline: string;
}

export function assertRouterCallMatches(
  call: unknown,
  expected: RouterCallExpectation,
): RouterCallFacts {
  const action = object(call, "the router call");
  if (typeof action.target !== "string" || evm(action.target) !== evm(expected.router)) {
    throw refuse(`it is addressed to ${String(action.target)}, not the router ${expected.router}`);
  }
  if (action.functionSelector !== SELECTOR) {
    throw refuse(`it calls ${String(action.functionSelector)} rather than ${SELECTOR}`);
  }

  const callValue = integer(action.callValue ?? "0", "callValue");
  const wanted = expected.nativeIn ? expected.amountIn : "0";
  if (callValue !== wanted) {
    throw refuse(
      expected.nativeIn
        ? `it would send ${callValue} SUN as the call's value and this swap spends ${wanted}`
        : `it would send ${callValue} SUN as the call's value and a token-for-token swap sends none`,
    );
  }

  const feeLimit = integer(action.feeLimit ?? "0", "feeLimit");
  if (feeLimit !== expected.feeLimit) {
    throw refuse(
      `its fee limit is ${feeLimit} SUN and ${expected.feeLimit} was asked for; the default is 500000000`,
    );
  }

  const parameters = array(action.parameters, "the call's parameters");
  if (parameters.length !== 3) {
    throw refuse(`it carries ${parameters.length} parameters rather than 3`);
  }
  const deadline = integer(object(parameters[2], "the deadline parameter").value, "deadline");
  const seconds = Number(deadline);
  if (seconds <= expected.now) {
    throw refuse(`its deadline of ${deadline} has already passed`);
  }
  if (seconds > expected.notAfter) {
    throw refuse(
      `its deadline of ${deadline} is further out than the ${expected.notAfter - expected.now} seconds allowed`,
    );
  }

  const words = wordsOf(object(parameters[1], "the call's inputs").value);
  present(words, expected.minimumOut, `the minimum output of ${expected.minimumOut}`);
  // Only for a token input. TRX travels as the call's value, which is compared EXACTLY above, and
  // measured: a V1 route spending 1 TRX does not write the amount into its inputs at all, so
  // requiring it there refused a correct call.
  if (!expected.nativeIn) {
    present(words, expected.amountIn, `the input amount of ${expected.amountIn}`);
  }
  present(
    words,
    BigInt(`0x${evm(expected.recipient)}`).toString(),
    `the recipient ${expected.recipient}`,
  );
  if (expected.permit !== undefined) {
    present(words, expected.permit.amount, `the permit's amount of ${expected.permit.amount}`);
    present(
      words,
      expected.permit.expiration,
      `the permit's expiration of ${expected.permit.expiration}`,
    );
    // The grant we refused to sign, looked for by value: an encoder that widened a bounded permit
    // into an unlimited one would otherwise leave no trace in anything we can read.
    absent(words, (2n ** 160n - 1n).toString(), "an unlimited Permit2 grant");
    absent(words, (2n ** 256n - 1n).toString(), "an unlimited token allowance");
  }

  return { target: expected.router, callValue, feeLimit, deadline };
}

/** Every 32-byte word of every `bytes` input, as decimal strings. */
function wordsOf(value: unknown): ReadonlySet<string> {
  const inputs = array(value, "the call's inputs");
  const words = new Set<string>();
  for (const input of inputs) {
    if (typeof input !== "string") {
      throw refuse(`one of its inputs is ${JSON.stringify(input)} rather than hex`);
    }
    const body = input.startsWith("0x") ? input.slice(2) : input;
    for (let at = 0; at + 64 <= body.length; at += 64) {
      words.add(BigInt(`0x${body.slice(at, at + 64)}`).toString());
    }
  }
  return words;
}

function present(words: ReadonlySet<string>, value: string, label: string): void {
  if (!words.has(value)) {
    throw refuse(`${label} does not appear anywhere in the encoded call`);
  }
}

function absent(words: ReadonlySet<string>, value: string, label: string): void {
  if (words.has(value)) {
    throw refuse(`${label} appears in the encoded call`);
  }
}

function integer(value: unknown, label: string): string {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value.toString();
  }
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  throw refuse(`its ${label} is ${JSON.stringify(value)}, which is not a whole number`);
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw refuse(`${label} is ${JSON.stringify(value)} rather than an object`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw refuse(`${label} is ${JSON.stringify(value)} rather than a list`);
  }
  return value;
}

function evm(address: string): string {
  const text = address.trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(text)) return text.slice(2).toLowerCase();
  if (/^(41)?[0-9a-fA-F]{40}$/.test(text)) return text.slice(-40).toLowerCase();
  return tronHexAddress(text).slice(2).toLowerCase();
}

function refuse(because: string): ChainError {
  return new ChainError(
    "router_call_mismatch",
    `refusing to send this Universal Router call: ${because}. The floor, the recipient and the deadline live inside the encoded call, so it is sent only when they are the ones that were quoted`,
  );
}
