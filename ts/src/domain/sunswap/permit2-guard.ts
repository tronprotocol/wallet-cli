/**
 * What a Permit2 signature actually authorizes, checked before we produce one.
 *
 * A Permit2 `PermitSingle` is a bearer grant. Signed, it lets `spender` move `amount` of `token`
 * out of the signer's account until `expiration`, with no transaction of ours in the way. So the
 * question this file answers is not "did the planner succeed" but "is the thing in front of me the
 * thing I meant to authorize" — and it is asked of the typed data itself, not of the inputs we
 * handed the planner, because the planner is the code under suspicion.
 *
 * Everything here is checkable BEFORE signing except one thing: `PermitSingle` carries no owner
 * field. The owner IS the signer, so it can only be confirmed by recovering the address from the
 * finished signature — which is why `assertSignedBy` exists separately and must still be called.
 *
 * The shape is measured, not assumed. Taken from a live mainnet plan:
 *
 *   primaryType "PermitSingle"
 *   domain      { name: "Permit2", chainId: 728126428, verifyingContract: "0xbe3653…" }
 *   message     { details: { token, amount, expiration, nonce }, spender, sigDeadline }
 *
 * The domain carries no `version` and no `salt`, addresses are lowercase 20-byte EVM hex rather
 * than base58, and `chainId` is a number. Every integer arrives as a decimal string.
 */
import { tronHexAddress } from "../address/index.js";
import { ChainError } from "../errors/index.js";

/** What the caller believes it is authorizing. All addresses base58; all amounts base units. */
export interface PermitExpectation {
  readonly token: string;
  /** The contract allowed to pull the tokens — the Universal Router, never anything else. */
  readonly spender: string;
  /** The Permit2 contract, which is the typed data's `verifyingContract`. */
  readonly permit2: string;
  readonly chainId: string;
  /** Exactly the amount being spent. A grant for more than the trade is not this trade. */
  readonly amount: string;
  /** Latest acceptable `sigDeadline` and `expiration`, unix seconds. */
  readonly notAfter: number;
  /** Now, unix seconds. Passed in so this stays pure and testable. */
  readonly now: number;
}

/** The verified grant, in the forms a receipt publishes. */
export interface PermitFacts {
  readonly token: string;
  readonly spender: string;
  readonly permit2: string;
  readonly amount: string;
  readonly expiration: string;
  readonly nonce: string;
  readonly sigDeadline: string;
}

/** The field lists a `PermitSingle` must declare, in order. A renamed or extra field changes the
 *  hash, and therefore changes what the signature authorizes. */
const REQUIRED_TYPES: Readonly<Record<string, readonly string[]>> = {
  PermitDetails: ["token:address", "amount:uint160", "expiration:uint48", "nonce:uint48"],
  PermitSingle: ["details:PermitDetails", "spender:address", "sigDeadline:uint256"],
};

const PRIMARY_TYPE = "PermitSingle";

/**
 * The typed data, verified against what we meant to authorize.
 *
 * Order is deliberate: the shape first, so later reads are of fields that exist; then the domain,
 * because a signature for another chain or another verifying contract is a different grant
 * entirely; then what is being granted, to whom, and for how long.
 *
 * A failure is `permit_mismatch` at exit 1, not a usage error: nothing the caller typed is wrong.
 * What went wrong is that a dependency produced an authorization we will not put a signature on,
 * which is the same class of fault as any other answer the CLI refuses to act on.
 */
export function assertPermitAuthorizes(
  typedData: unknown,
  expected: PermitExpectation,
): PermitFacts {
  const payload = object(typedData, "the Permit2 typed data");

  // Declared primary type, checked BEFORE signing rather than after. A `PermitBatch` would
  // authorize several tokens at once, and the point of a guard is to refuse that while the
  // signature does not yet exist.
  if (payload.primaryType !== PRIMARY_TYPE) {
    throw refuse(`its primary type is ${JSON.stringify(payload.primaryType)}, not ${PRIMARY_TYPE}`);
  }
  assertTypes(payload.types);

  const domain = object(payload.domain, "the typed data's domain");
  if (domain.name !== "Permit2") {
    throw refuse(`its domain names ${JSON.stringify(domain.name)} rather than Permit2`);
  }
  if (integer(domain.chainId, "domain.chainId") !== expected.chainId) {
    throw refuse(
      `it is bound to chain ${integer(domain.chainId, "domain.chainId")} and this network is ${expected.chainId}`,
    );
  }
  assertAddress(domain.verifyingContract, expected.permit2, "verifying contract");

  const message = object(payload.message, "the typed data's message");
  const details = object(message.details, "the permit's details");
  assertAddress(details.token, expected.token, "token");
  assertAddress(message.spender, expected.spender, "spender");

  const amount = integer(details.amount, "details.amount");
  if (amount !== expected.amount) {
    throw refuse(
      `it would authorize ${amount} of the token and this swap spends ${expected.amount}`,
    );
  }

  const expiration = deadline(details.expiration, "details.expiration", expected);
  const sigDeadline = deadline(message.sigDeadline, "sigDeadline", expected);

  return {
    token: expected.token,
    spender: expected.spender,
    permit2: expected.permit2,
    amount,
    expiration,
    nonce: integer(details.nonce, "details.nonce"),
    sigDeadline,
  };
}

/**
 * The signer, confirmed to be the account we are trading for.
 *
 * This is the owner check, and it cannot happen any earlier: `PermitSingle` has no owner field, so
 * until a signature exists there is nothing to compare. It is also the check that catches a signer
 * that hashed something other than what we inspected — a mismatched recovery means the digest we
 * verified is not the digest that was signed.
 */
export function assertSignedBy(recovered: string, owner: string, primaryType: string): void {
  if (primaryType !== PRIMARY_TYPE) {
    throw new ChainError(
      "signing_rejected",
      `the signer hashed a ${primaryType} rather than a ${PRIMARY_TYPE}, so the signature does not authorize what was checked`,
    );
  }
  if (evm(recovered) !== evm(owner)) {
    throw new ChainError(
      "signing_rejected",
      `the Permit2 signature recovers to ${recovered} and this swap is for ${owner}; it would authorize a transfer from somebody else's account`,
    );
  }
}

function assertTypes(value: unknown): void {
  const types = object(value, "the typed data's types");
  for (const [name, fields] of Object.entries(REQUIRED_TYPES)) {
    const declared = types[name];
    if (!Array.isArray(declared)) {
      throw refuse(`it declares no ${name} type`);
    }
    const actual = declared.map((field) => {
      const entry = object(field, `a field of ${name}`);
      return `${String(entry.name)}:${String(entry.type)}`;
    });
    if (actual.join(",") !== fields.join(",")) {
      throw refuse(`its ${name} is (${actual.join(", ")}) rather than (${fields.join(", ")})`);
    }
  }
}

/** An address field, compared as 20-byte EVM hex because that is the form the typed data uses. */
function assertAddress(actual: unknown, expected: string, label: string): void {
  if (typeof actual !== "string") {
    throw refuse(`its ${label} is ${JSON.stringify(actual)}, which is not an address`);
  }
  if (evm(actual) !== evm(expected)) {
    throw refuse(`its ${label} is ${actual}, not ${expected}`);
  }
}

/**
 * A deadline that is in the future and no further out than we asked for.
 *
 * Both bounds matter. One in the past authorizes nothing and would waste the approval that
 * preceded it; one beyond our TTL leaves a grant standing long after the trade, which is the
 * standing-allowance problem Permit2 exists to avoid.
 */
function deadline(value: unknown, label: string, expected: PermitExpectation): string {
  const text = integer(value, label);
  const seconds = Number(text);
  if (seconds <= expected.now) {
    throw refuse(`its ${label} of ${text} has already passed`);
  }
  if (seconds > expected.notAfter) {
    throw refuse(
      `its ${label} of ${text} is further out than the ${expected.notAfter - expected.now} seconds requested`,
    );
  }
  return text;
}

/** A non-negative integer as a decimal string, whatever form it arrived in. */
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

/** Any TRON or EVM form of an address as lowercase 20-byte hex, for comparison only. */
function evm(address: string): string {
  const text = address.trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(text)) return text.slice(2).toLowerCase();
  if (/^(41)?[0-9a-fA-F]{40}$/.test(text)) return text.slice(-40).toLowerCase();
  return tronHexAddress(text).slice(2).toLowerCase();
}

function refuse(because: string): ChainError {
  return new ChainError(
    "permit_mismatch",
    `refusing to sign this Permit2 authorization: ${because}. A signed permit lets the spender move the tokens without a transaction of ours, so it is signed only when it matches the swap exactly`,
  );
}
