import type { ContactRepository } from "../ports/contact-repository.js";
import type { ChainFamily, ResolvedRecipient } from "../../domain/types/index.js";
import { addressCodec, familyOf } from "../../domain/family/index.js";
import { contactNameKey, resembledFamily } from "../../domain/contact/index.js";
import { UsageError } from "../../domain/errors/index.js";

/**
 * Turns a `--to` value into an address. The ordering is the whole security property:
 *
 *   1. a valid address of the target family wins outright;
 *   2. anything that merely LOOKS like an address is a hard error — never a contact lookup,
 *      because otherwise a checksum typo silently resolves to whoever registered that name;
 *   3. only a value that could not be an address at all is treated as a contact name.
 */
export class RecipientResolver {
  constructor(private readonly contacts: ContactRepository) {}

  resolve(family: ChainFamily, input: string): ResolvedRecipient {
    const value = input.trim();

    if (addressCodec(family).validate(value)) {
      return { address: value };
    }

    // The family the value LOOKS like — by shape, so a mistyped address still names its own
    // chain rather than the selected one.
    const looksLike = resembledFamily(value);
    if (looksLike) {
      // A WELL-FORMED address of another family is a different mistake from a typo, and saying
      // "contact not found" would send the user looking for a contact they never made.
      if (looksLike !== family) {
        const valid = familyOf(value) !== undefined;
        throw new UsageError(
          "family_mismatch",
          valid
            ? `recipient is a ${looksLike} address but the selected network is ${family}`
            : `recipient looks like a ${looksLike} address, which the selected ${family} network cannot pay`,
        );
      }
      throw new UsageError(
        "invalid_value",
        `recipient resembles a ${family} address but has an invalid length or checksum`,
      );
    }

    const key = contactNameKey(value);
    const entry = this.contacts.find(family, key);
    if (entry) return { address: entry.address, contactName: entry.name };

    // The name is unique book-wide, so if it exists at all it exists exactly once — and a hit
    // here means it belongs to another chain. Reporting contact_not_found would send the user
    // hunting for something they can plainly see in `contact list`. The message talks about the
    // ADDRESS rather than the family: the user never has to learn that word.
    const elsewhere = this.contacts.findAnywhere(key);
    if (elsewhere) {
      throw new UsageError(
        "family_mismatch",
        `contact ${elsewhere.name} holds the address ${elsewhere.address}, which the selected network cannot pay`,
      );
    }
    throw new UsageError("contact_not_found", `contact not found: ${value}`);
  }
}
