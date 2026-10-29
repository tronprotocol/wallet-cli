import type { ContactRepository } from "../ports/contact-repository.js";
import type { ContactEntry, ContactListView, ContactView } from "../../domain/types/index.js";
import { contactNameKey, createContact } from "../../domain/contact/index.js";
import { CHAIN_FAMILIES, familyOf } from "../../domain/family/index.js";
import { errorMessage, UsageError } from "../../domain/errors/index.js";

export class ContactService {
  constructor(private readonly contacts: ContactRepository) {}

  add(name: string, address: string, note?: string): ContactView {
    const value = address.trim();
    const family = familyOf(value);
    if (!family) {
      throw new UsageError(
        "invalid_address",
        errorMessage`not a recognised chain address: ${address}`,
      );
    }
    return publicContact(this.contacts.add(createContact(family, name, value, note)));
  }

  #entries(): ContactEntry[] {
    return CHAIN_FAMILIES.flatMap((family) => this.contacts.list(family));
  }

  list(): ContactListView {
    return { contacts: this.#entries().map(publicContact) };
  }

  remove(name: string): ContactView {
    const key = contactNameKey(name);
    const family = CHAIN_FAMILIES.find((f) => this.contacts.find(f, key));
    if (!family) {
      throw new UsageError("contact_not_found", errorMessage`contact not found: ${name}`);
    }
    return publicContact(this.contacts.remove(family, key));
  }
}

function publicContact(entry: ContactEntry): ContactView {
  return { name: entry.name, address: entry.address, note: entry.note };
}
