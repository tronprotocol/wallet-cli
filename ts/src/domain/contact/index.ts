import type { ChainFamily, ContactEntry } from "../types/index.js";
import { errorMessage, UsageError } from "../errors/index.js";
import { addressBodyLength, addressCodec, CHAIN_FAMILIES } from "../family/index.js";

// Match mistyped addresses too, so recipient typos cannot redirect through contact names.
const ADDRESS_SHAPED: Array<[ChainFamily, { min: number; max: number }]> = [
  ["tron", { min: 25, max: 40 }],
  ["evm", { min: 38, max: 42 }],
];
const UNSAFE_TEXT = /[\p{Cc}\p{Cf}]/u;

// Returns a case-insensitive NFKC lookup key.
export function contactNameKey(input: string): string {
  return contactName(input).normalize("NFKC").toLowerCase();
}

export function contactName(input: string): string {
  const value = input.trim();
  const length = Array.from(value).length;
  if (length < 1 || length > 64 || UNSAFE_TEXT.test(value) || resemblesAddress(value)) {
    throw new UsageError(
      "invalid_value",
      "contact name must be 1-64 safe characters and must not resemble a chain address",
    );
  }
  return value;
}

export function contactNote(input?: string): string | null {
  if (input === undefined) return null;
  const value = input.trim();
  if (Array.from(value).length > 128 || UNSAFE_TEXT.test(value)) {
    throw new UsageError("invalid_value", "contact note must contain at most 128 safe characters");
  }
  return value || null;
}

export function createContact(
  family: ChainFamily,
  nameInput: string,
  address: string,
  noteInput?: string,
): ContactEntry {
  if (!CHAIN_FAMILIES.includes(family) || !addressCodec(family).validate(address)) {
    throw new UsageError("invalid_address", `contact address must be a valid ${family} address`);
  }
  const name = contactName(nameInput);
  return {
    family,
    name,
    nameKey: contactNameKey(name),
    address: addressCodec(family).canonical(address),
    note: contactNote(noteInput),
  };
}

// Includes malformed addresses.
export function resemblesAddress(input: string): boolean {
  return resembledFamily(input) !== undefined;
}

// Identifies the family by shape, without validating the address.
export function resembledFamily(input: string): ChainFamily | undefined {
  const value = input.trim();
  return ADDRESS_SHAPED.find(([family, { min, max }]) => {
    const length = addressBodyLength(family, value);
    return length !== undefined && length >= min && length <= max;
  })?.[0];
}

// A new contact must not reuse a name or an address held in any family.
export function assertContactAddable(existing: readonly ContactEntry[], entry: ContactEntry): void {
  const clash = existing.find((e) => e.nameKey === entry.nameKey || e.address === entry.address);
  if (!clash) return;
  throw new UsageError(
    "already_exists",
    clash.nameKey === entry.nameKey
      ? errorMessage`a contact named ${clash.name} already exists`
      : errorMessage`that address is already stored as ${clash.name}`,
  );
}

// Names are unique across families in a stored book.
export function hasDuplicateContactName(entries: readonly ContactEntry[]): boolean {
  return new Set(entries.map((e) => e.nameKey)).size !== entries.length;
}
