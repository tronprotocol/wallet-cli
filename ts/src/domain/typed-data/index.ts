/**
 * TypedDataPayload — the EIP-712 / TIP-712 value object and its normalization rules.
 * Pure: no hashing, no signing, no I/O. Hashing is family-specific and lives in the outbound
 * adapters (tronweb for TRON); this module only decides what a well-formed payload is.
 */
import { UsageError } from "../errors/index.js";

export interface TypedDataField {
  name: string;
  type: string;
}

export interface TypedDataPayload {
  domain: Record<string, unknown>;
  types: Record<string, TypedDataField[]>;
  /** inferred from `types` when the caller omits it. */
  primaryType?: string;
  message: Record<string, unknown>;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A field's struct name, with any array suffixes (`Person[]`, `Person[2][]`) stripped. */
function elementType(type: string): string {
  return type.replace(/(\[\d*\])+$/, "");
}

/** Whether `name` appears as a field type (bare or as an array element) of any struct in `types`. */
function isReferencedType(types: Record<string, TypedDataField[]>, name: string): boolean {
  for (const fields of Object.values(types)) {
    for (const f of fields) {
      if (elementType(f.type) === name) return true;
    }
  }
  return false;
}

/**
 * The structs `root` actually reaches, in declaration order.
 *
 * `primaryType` is what says WHICH struct is being signed, and the EIP-712 JSON-RPC schema carries
 * it precisely because the type map alone does not determine the root. A payload may therefore
 * declare types the chosen root never reaches — one shared dictionary covering several message
 * kinds is the ordinary case. An encoder handed that whole map sees more than one root and refuses,
 * so the map has to be narrowed to the closure before it gets there.
 *
 * Narrowing cannot change what a payload hashes to: every type a single-root payload declares is
 * reachable from that root, so its closure is the whole map. `seen` also makes the walk terminate
 * on a cycle below the root — a cycle THROUGH the root is refused earlier as not being a root.
 */
function typeClosure(
  types: Record<string, TypedDataField[]>,
  root: string,
): Record<string, TypedDataField[]> {
  const seen = new Set<string>();
  const walk = (name: string): void => {
    const fields = types[name];
    if (fields === undefined || seen.has(name)) return; // primitives have no entry; cycles stop here
    seen.add(name);
    for (const f of fields) walk(elementType(f.type));
  };
  walk(root);
  return Object.fromEntries(Object.entries(types).filter(([name]) => seen.has(name)));
}

/**
 * Validate and canonicalize a caller-supplied typed-data payload.
 * - `EIP712Domain` is dropped from `types`: it describes `domain`, it is not a struct to hash,
 *   and ethers' TypedDataEncoder (which tronweb reuses) throws when it is present.
 * - `value` is accepted as an alias for `message`; some producers emit that spelling.
 */
export function normalizeTypedData(raw: unknown): TypedDataPayload {
  if (!isObject(raw)) throw new UsageError("invalid_payload", "typed data must be a JSON object");
  const { domain, types, primaryType } = raw;
  if (!isObject(domain))
    throw new UsageError("invalid_payload", "typed data `domain` must be an object");
  if (!isObject(types))
    throw new UsageError("invalid_payload", "typed data `types` must be an object");

  const message = raw.message ?? raw.value;
  if (!isObject(message))
    throw new UsageError("invalid_payload", "typed data `message` must be an object");

  const structs: Record<string, TypedDataField[]> = {};
  for (const [name, fields] of Object.entries(types)) {
    if (name === "EIP712Domain") continue;
    if (!Array.isArray(fields)) {
      throw new UsageError(
        "invalid_value",
        `typed data type \`${name}\` must be an array of fields`,
      );
    }
    for (const f of fields) {
      if (!isObject(f) || typeof f.name !== "string" || typeof f.type !== "string") {
        throw new UsageError(
          "invalid_value",
          `typed data type \`${name}\` has a field without a name/type`,
        );
      }
    }
    structs[name] = fields as TypedDataField[];
  }
  if (Object.keys(structs).length === 0) {
    throw new UsageError(
      "invalid_payload",
      "typed data `types` must declare at least one struct type besides EIP712Domain",
    );
  }
  if (primaryType !== undefined && typeof primaryType !== "string") {
    throw new UsageError("invalid_payload", "typed data `primaryType` must be a string");
  }
  if (typeof primaryType === "string" && !(primaryType in structs)) {
    throw new UsageError(
      "invalid_value",
      `typed data \`primaryType\` "${primaryType}" is not declared in types`,
    );
  }
  // The signed message is always the root struct — the one no other struct references. A supplied
  // primaryType that IS referenced (directly or through an array field) is nested, so it can never be
  // what gets signed; reject it rather than sign the root while echoing the caller's nested type.
  if (typeof primaryType === "string" && isReferencedType(structs, primaryType)) {
    throw new UsageError(
      "invalid_value",
      `typed data \`primaryType\` "${primaryType}" is not a root type; it is referenced as a field type, so it cannot be the message root`,
    );
  }

  // With a declared root, hand on only what that root reaches. Without one there is nothing to
  // compute a closure from: the encoder infers the root, which is well defined only when the
  // payload has exactly one.
  const reachable = primaryType === undefined ? structs : typeClosure(structs, primaryType);

  return {
    domain,
    types: reachable,
    ...(primaryType === undefined ? {} : { primaryType }),
    message,
  };
}
