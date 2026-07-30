import type { ChainFamily, ContactEntry } from "../types/index.js";
import { UsageError } from "../errors/index.js";
import { TronAddress } from "../address/index.js";

const TRON_SHAPED = /^T[1-9A-HJ-NP-Za-km-z]{25,40}$/;
const UNSAFE_TEXT = /[\p{Cc}\p{Cf}]/u;
const ADDRESS = new TronAddress();

/** Case-insensitive, compatibility-normalized lookup key. */
export function contactNameKey(input: string): string {
  return contactName(input).normalize("NFKC").toLowerCase();
}

export function contactName(input: string): string {
  const value = input.trim();
  const length = Array.from(value).length;
  if (
    length < 1
    || length > 64
    || UNSAFE_TEXT.test(value)
    || TRON_SHAPED.test(value)
  ) {
    throw new UsageError(
      "invalid_value",
      "contact name must be 1-64 safe characters and must not resemble a TRON address",
    );
  }
  return value;
}

export function contactNote(input?: string): string | null {
  if (input === undefined) return null;
  const value = input.trim();
  if (Array.from(value).length > 128 || UNSAFE_TEXT.test(value)) {
    throw new UsageError(
      "invalid_value",
      "contact note must contain at most 128 safe characters",
    );
  }
  return value || null;
}

export function createContact(
  family: ChainFamily,
  nameInput: string,
  address: string,
  noteInput?: string,
): ContactEntry {
  if (family !== "tron" || !ADDRESS.validate(address)) {
    throw new UsageError(
      "invalid_value",
      "contact address must be a valid TRON Base58Check address",
    );
  }
  const name = contactName(nameInput);
  return {
    family,
    name,
    nameKey: contactNameKey(name),
    address,
    note: contactNote(noteInput),
  };
}

export function resemblesTronAddress(input: string): boolean {
  return TRON_SHAPED.test(input.trim());
}
