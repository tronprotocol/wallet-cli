// Scalars are checked exactly; encoded inputs are checked only for word containment.
// Containment does not prove field roles: another field or a small integer can satisfy a check.
import { tronHash20Hex } from "../address/index.js";
import { ChainError } from "../errors/index.js";
import { sunAmount, type Sun } from "../amounts/index.js";

const SELECTOR = "execute(bytes,bytes[],uint256)";

export interface RouterCallExpectation {
  readonly router: string;
  // Input-token base units.
  readonly amountIn: string;
  // Output-token base units.
  readonly minimumOut: string;
  readonly recipient: string;
  // Native input travels as callValue in SUN; token input sends zero.
  readonly nativeIn: boolean;
  readonly feeLimit: Sun;
  // Latest deadline and current time, Unix seconds.
  readonly notAfter: number;
  readonly now: number;
  // Signed permit values must also appear in calldata; unlimited grants are rejected.
  readonly permit?: { readonly amount: string; readonly expiration: string };
}

export interface RouterCallFacts {
  readonly target: string;
  readonly callValue: Sun;
  readonly feeLimit: Sun;
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
  // Native input is checked as callValue; routes may omit it from encoded inputs.
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
    absent(words, (2n ** 160n - 1n).toString(), "an unlimited Permit2 grant");
    absent(words, (2n ** 256n - 1n).toString(), "an unlimited token allowance");
  }

  return {
    target: expected.router,
    callValue: sunAmount(callValue),
    feeLimit: sunAmount(feeLimit),
    deadline,
  };
}

// Complete 32-byte ABI words as decimal strings; trailing partial words are ignored.
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
  return tronHash20Hex(address.trim());
}

function refuse(because: string): ChainError {
  return new ChainError(
    "router_call_mismatch",
    `refusing to send this Universal Router call: ${because}. The floor, the recipient and the deadline live inside the encoded call, so it is sent only when they are the ones that were quoted`,
  );
}
