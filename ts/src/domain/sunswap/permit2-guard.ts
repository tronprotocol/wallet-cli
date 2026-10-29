// Check planner output before signing; PermitSingle owner verification also requires signature recovery.
import { tronHash20Hex } from "../address/index.js";
import { ChainError } from "../errors/index.js";

// Expected addresses are base58; amounts are base units.
export interface PermitExpectation {
  readonly token: string;
  // Contract allowed to pull tokens.
  readonly spender: string;
  // Typed-data verifyingContract.
  readonly permit2: string;
  readonly chainId: string;
  // Must match the spend exactly; larger grants are rejected.
  readonly amount: string;
  // Latest sigDeadline and expiration, Unix seconds.
  readonly notAfter: number;
  // Unix seconds.
  readonly now: number;
}

export interface PermitFacts {
  readonly token: string;
  readonly spender: string;
  readonly permit2: string;
  readonly amount: string;
  readonly expiration: string;
  readonly nonce: string;
  readonly sigDeadline: string;
}

// Field names, types, and order affect the signed hash.
const REQUIRED_TYPES: Readonly<Record<string, readonly string[]>> = {
  PermitDetails: ["token:address", "amount:uint160", "expiration:uint48", "nonce:uint48"],
  PermitSingle: ["details:PermitDetails", "spender:address", "sigDeadline:uint256"],
};

const PRIMARY_TYPE = "PermitSingle";

export function assertPermitAuthorizes(
  typedData: unknown,
  expected: PermitExpectation,
): PermitFacts {
  const payload = object(typedData, "the Permit2 typed data");

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

// PermitSingle has no owner field; verify the recovered signer after signing.
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

// Compare base58 expectations and typed-data addresses as 20-byte hex.
function assertAddress(actual: unknown, expected: string, label: string): void {
  if (typeof actual !== "string") {
    throw refuse(`its ${label} is ${JSON.stringify(actual)}, which is not an address`);
  }
  if (evm(actual) !== evm(expected)) {
    throw refuse(`its ${label} is ${actual}, not ${expected}`);
  }
}

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

// Normalize to lowercase 20-byte hex for comparison.
function evm(address: string): string {
  return tronHash20Hex(address.trim());
}

function refuse(because: string): ChainError {
  return new ChainError(
    "permit_mismatch",
    `refusing to sign this Permit2 authorization: ${because}. A signed permit lets the spender move the tokens without a transaction of ours, so it is signed only when it matches the swap exactly`,
  );
}
