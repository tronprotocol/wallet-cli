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
      // Canonical (§1.3): what goes into the transaction is what the receipt will show, so a
      // lowercase paste does not come back looking like a different recipient.
      return { address: addressCodec(family).canonical(value) };
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
        "invalid_address",
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
    // Neither an address nor a name in the book. WHICH of the two the user meant is knowable only
    // from how the value starts: `--to` takes either, so an answer that names just one of them
    // sends half the callers looking in the wrong place. A value that opens like an address is
    // reported as a failed address (and still mentions the book); anything else is reported as a
    // failed name (and still mentions addresses).
    if (looksLikeAddressAttempt(value)) {
      throw new UsageError(
        "invalid_address",
        `${value} is not a valid ${family} address, and no contact is named that either`,
      );
    }
    throw new UsageError(
      "contact_not_found",
      `no contact named ${value}, and it is not an address either`,
    );
  }
}

/**
 * Did the caller mean this to be an address?
 *
 * Not "is it a valid address" (that is settled above) and not "is it address-SHAPED" (a near-miss,
 * also settled above) — this is the weaker question of whether it OPENS like one. `0xnotanaddress`
 * is neither valid nor shaped, but nobody types `0x` while reaching for a contact name.
 */
function looksLikeAddressAttempt(value: string): boolean {
  return /^0x/i.test(value) || /^T[1-9A-HJ-NP-Za-km-z]{10,}$/.test(value);
}
