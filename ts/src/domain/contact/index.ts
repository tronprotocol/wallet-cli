import type { ChainFamily, ContactEntry } from "../types/index.js";
import { UsageError } from "../errors/index.js";
import { addressCodec, CHAIN_FAMILIES } from "../family/index.js";

/**
 * Address-SHAPED, not address-VALID: these deliberately match a near-miss too — a checksum typo,
 * a truncated paste. A name may not look like any of them, and a recipient that looks like one is
 * never allowed to fall through to a name lookup. Without that, "typed one character wrong"
 * silently becomes "sent to whoever registered that name".
 */
const ADDRESS_SHAPED: Array<[ChainFamily, RegExp]> = [
  ["tron", /^T[1-9A-HJ-NP-Za-km-z]{25,40}$/], // base58check
  ["evm", /^0x[0-9a-fA-F]{38,42}$/], // hex
];
const UNSAFE_TEXT = /[\p{Cc}\p{Cf}]/u;

/** Case-insensitive, compatibility-normalized lookup key. */
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
  // Validated against the entry's OWN family: a TRON address filed under `evm` would make
  // `--to friend` resolve, on an EVM network, to an address that does not exist there.
  if (!CHAIN_FAMILIES.includes(family) || !addressCodec(family).validate(address)) {
    throw new UsageError("invalid_address", `contact address must be a valid ${family} address`);
  }
  const name = contactName(nameInput);
  return {
    family,
    name,
    nameKey: contactNameKey(name),
    // Canonical (§1.3): the book is a display surface as much as a lookup, and the loader runs
    // this same constructor, so an entry written before this rule normalises when it is read.
    address: addressCodec(family).canonical(address),
    note: contactNote(noteInput),
  };
}

/** whether a value looks like a chain address of ANY family — including a malformed one. */
export function resemblesAddress(input: string): boolean {
  return resembledFamily(input) !== undefined;
}

/**
 * Which family a value LOOKS like, by shape alone — unlike `familyOf`, which needs a valid
 * address. That difference is the point: a mistyped recipient has no valid family, and telling
 * the user it "resembles a <selected network> address" names the wrong chain's rules and sends
 * them to check the wrong thing.
 */
export function resembledFamily(input: string): ChainFamily | undefined {
  const value = input.trim();
  return ADDRESS_SHAPED.find(([, shape]) => shape.test(value))?.[0];
}
