import type { ContactRepository } from "../ports/contact-repository.js";
import type {
  ChainFamily,
  ResolvedRecipient,
} from "../../domain/types/index.js";
import { TronAddress } from "../../domain/address/index.js";
import {
  contactNameKey,
  resemblesTronAddress,
} from "../../domain/contact/index.js";
import { UsageError } from "../../domain/errors/index.js";

export class RecipientResolver {
  readonly #tron = new TronAddress();

  constructor(private readonly contacts: ContactRepository) {}

  resolve(family: ChainFamily, input: string): ResolvedRecipient {
    const value = input.trim();
    if (family === "tron" && this.#tron.validate(value)) {
      return { address: value };
    }
    // Never let a checksum typo fall through to a same-looking contact alias.
    if (family === "tron" && resemblesTronAddress(value)) {
      throw new UsageError(
        "invalid_value",
        "recipient resembles a TRON address but has an invalid length or checksum",
      );
    }
    const entry = this.contacts.find(family, contactNameKey(value));
    if (!entry) {
      throw new UsageError(
        "contact_not_found",
        `contact not found: ${value}`,
      );
    }
    return { address: entry.address, contactName: entry.name };
  }
}
