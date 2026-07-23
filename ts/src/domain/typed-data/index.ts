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

/**
 * Validate and canonicalize a caller-supplied typed-data payload.
 * - `EIP712Domain` is dropped from `types`: it describes `domain`, it is not a struct to hash,
 *   and ethers' TypedDataEncoder (which tronweb reuses) throws when it is present.
 * - `value` is accepted as an alias for `message`; some producers emit that spelling.
 */
export function normalizeTypedData(raw: unknown): TypedDataPayload {
  if (!isObject(raw)) throw new UsageError("invalid_value", "typed data must be a JSON object");
  const { domain, types, primaryType } = raw;
  if (!isObject(domain)) throw new UsageError("invalid_value", "typed data `domain` must be an object");
  if (!isObject(types)) throw new UsageError("invalid_value", "typed data `types` must be an object");

  const message = raw.message ?? raw.value;
  if (!isObject(message)) throw new UsageError("invalid_value", "typed data `message` must be an object");

  const structs: Record<string, TypedDataField[]> = {};
  for (const [name, fields] of Object.entries(types)) {
    if (name === "EIP712Domain") continue;
    if (!Array.isArray(fields)) {
      throw new UsageError("invalid_value", `typed data type \`${name}\` must be an array of fields`);
    }
    for (const f of fields) {
      if (!isObject(f) || typeof f.name !== "string" || typeof f.type !== "string") {
        throw new UsageError("invalid_value", `typed data type \`${name}\` has a field without a name/type`);
      }
    }
    structs[name] = fields as TypedDataField[];
  }
  if (Object.keys(structs).length === 0) {
    throw new UsageError("invalid_value", "typed data `types` must declare at least one struct type besides EIP712Domain");
  }
  if (primaryType !== undefined && typeof primaryType !== "string") {
    throw new UsageError("invalid_value", "typed data `primaryType` must be a string");
  }
  if (typeof primaryType === "string" && !(primaryType in structs)) {
    throw new UsageError("invalid_value", `typed data \`primaryType\` "${primaryType}" is not declared in types`);
  }

  return { domain, types: structs, ...(primaryType === undefined ? {} : { primaryType }), message };
}
