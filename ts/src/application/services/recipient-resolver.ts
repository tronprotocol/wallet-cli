import type { ContactRepository } from "../ports/contact-repository.js";
import type { ChainFamily, ResolvedRecipient } from "../../domain/types/index.js";
import { addressCodec, familyOf } from "../../domain/family/index.js";
import { contactNameKey, resembledFamily } from "../../domain/contact/index.js";
import { UsageError } from "../../domain/errors/index.js";

// Reject malformed address-shaped values before contact lookup to prevent impersonation.
export class RecipientResolver {
  constructor(private readonly contacts: ContactRepository) {}

  resolve(family: ChainFamily, input: string): ResolvedRecipient {
    const value = input.trim();

    if (addressCodec(family).validate(value)) {
      // The transaction and receipt must use the same address encoding.
      return { address: addressCodec(family).canonical(value) };
    }

    const looksLike = resembledFamily(value);
    if (looksLike) {
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

    const elsewhere = this.contacts.findAnywhere(key);
    if (elsewhere) {
      throw new UsageError(
        "family_mismatch",
        `contact ${elsewhere.name} holds the address ${elsewhere.address}, which the selected network cannot pay`,
      );
    }
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

function looksLikeAddressAttempt(value: string): boolean {
  return /^0x/i.test(value) || /^T[1-9A-HJ-NP-Za-km-z]{10,}$/.test(value);
}
