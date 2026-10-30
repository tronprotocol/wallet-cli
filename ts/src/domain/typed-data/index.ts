import { UsageError } from "../errors/index.js";

export interface TypedDataField {
  name: string;
  type: string;
}

// A JSON value; payment SDKs also pass uint fields as bigint.
export type TypedDataValue =
  string | number | bigint | boolean | null | TypedDataValue[] | TypedDataObject;

export interface TypedDataObject {
  [field: string]: TypedDataValue;
}

export interface TypedDataPayload {
  domain: TypedDataObject;
  types: Record<string, TypedDataField[]>;
  // May be inferred from types when there is exactly one root.
  primaryType?: string;
  message: TypedDataObject;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const INVALID = Symbol("invalid");

function typedDataValue(v: unknown): TypedDataValue | typeof INVALID {
  if (v === null || typeof v === "string" || typeof v === "boolean" || typeof v === "bigint")
    return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : INVALID;
  if (Array.isArray(v)) {
    const items = v.map(typedDataValue);
    return items.includes(INVALID) ? INVALID : (items as TypedDataValue[]);
  }
  return typedDataObject(v) ?? INVALID;
}

// An undefined member reads as an absent field, so it is dropped from the copy.
function typedDataObject(v: unknown): TypedDataObject | undefined {
  if (!isObject(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v)))
    return undefined;
  const members: [string, TypedDataValue][] = [];
  for (const [field, member] of Object.entries(v)) {
    if (member === undefined) continue;
    const value = typedDataValue(member);
    if (value === INVALID) return undefined;
    members.push([field, value]);
  }
  return Object.fromEntries(members);
}

function elementType(type: string): string {
  return type.replace(/(\[\d*\])+$/, "");
}

function isReferencedType(types: Record<string, TypedDataField[]>, name: string): boolean {
  for (const fields of Object.values(types)) {
    for (const f of fields) {
      if (elementType(f.type) === name) return true;
    }
  }
  return false;
}

// Drop unrelated structs so encoders see only the selected signing root.
function typeClosure(
  types: Record<string, TypedDataField[]>,
  root: string,
): Record<string, TypedDataField[]> {
  const seen = new Set<string>();
  const walk = (name: string): void => {
    const fields = types[name];
    if (fields === undefined || seen.has(name)) return; // Stop at primitives and cycles.
    seen.add(name);
    for (const f of fields) walk(elementType(f.type));
  };
  walk(root);
  return Object.fromEntries(Object.entries(types).filter(([name]) => seen.has(name)));
}

function rootTypes(types: Record<string, TypedDataField[]>): string[] {
  return Object.keys(types).filter((name) => !isReferencedType(types, name));
}

// Returns the declared or unique root; callers requiring a signing guard must reject undefined.
export function resolvePrimaryType(
  payload: Pick<TypedDataPayload, "types" | "primaryType">,
): string | undefined {
  if (payload.primaryType !== undefined) return payload.primaryType;
  const roots = rootTypes(payload.types);
  return roots.length === 1 ? roots[0] : undefined;
}

// Drops EIP712Domain for encoder compatibility; accepts value as an alias for message.
export function normalizeTypedData(raw: unknown): TypedDataPayload {
  if (!isObject(raw)) throw new UsageError("invalid_payload", "typed data must be a JSON object");
  const { types, primaryType } = raw;
  const domain = typedDataObject(raw.domain);
  if (domain === undefined)
    throw new UsageError("invalid_payload", "typed data `domain` must be an object of JSON values");
  if (!isObject(types))
    throw new UsageError("invalid_payload", "typed data `types` must be an object");

  const message = typedDataObject(raw.message ?? raw.value);
  if (message === undefined)
    throw new UsageError(
      "invalid_payload",
      "typed data `message` must be an object of JSON values",
    );

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
  // Reject nested primary types to keep the reported type consistent with the signing root.
  if (typeof primaryType === "string" && isReferencedType(structs, primaryType)) {
    throw new UsageError(
      "invalid_value",
      `typed data \`primaryType\` "${primaryType}" is not a root type; it is referenced as a field type, so it cannot be the message root`,
    );
  }

  // Without a declared root, leave inference to the encoder.
  const reachable = primaryType === undefined ? structs : typeClosure(structs, primaryType);

  return {
    domain,
    types: reachable,
    ...(primaryType === undefined ? {} : { primaryType }),
    message,
  };
}
