import type { ContactRepository } from "../ports/contact-repository.js";
import type { ContactEntry, ContactListView, ContactView } from "../../domain/types/index.js";
import { contactNameKey, createContact } from "../../domain/contact/index.js";
import { CHAIN_FAMILIES, familyOf } from "../../domain/family/index.js";
import { UsageError } from "../../domain/errors/index.js";

export class ContactService {
  constructor(private readonly contacts: ContactRepository) {}

  /**
   * The family comes from the address itself — asking the user to restate what the address
   * already says is only a chance to disagree with it.
   *
   * Names and addresses are unique across the WHOLE book, not per family. Externally this is a
   * flat name↔address map; family is only how entries are bucketed on disk and how `--to` routes
   * them. Per-family uniqueness was never chosen — it fell out of the storage shape, and it is
   * what made `remove <name>` ambiguous and pulled a `--family` flag into the design.
   */
  add(name: string, address: string, note?: string): ContactView {
    const value = address.trim();
    const family = familyOf(value);
    if (!family) {
      throw new UsageError("invalid_address", `not a recognised chain address: ${address}`);
    }
    const key = contactNameKey(name);
    const clash = this.#entries().find((e) => e.nameKey === key || e.address === value);
    if (clash) {
      throw new UsageError(
        "already_exists",
        clash.nameKey === key
          ? `a contact named ${clash.name} already exists`
          : `that address is already stored as ${clash.name}`,
      );
    }
    return publicContact(this.contacts.add(createContact(family, name, value, note)));
  }

  /** every entry, across families — the book as the user sees it. */
  #entries(): ContactEntry[] {
    return CHAIN_FAMILIES.flatMap((family) => this.contacts.list(family));
  }

  list(): ContactListView {
    return { contacts: this.#entries().map(publicContact) };
  }

  /** Addressed by name alone, which is unambiguous because names are unique book-wide. */
  remove(name: string): ContactView {
    const key = contactNameKey(name);
    const family = CHAIN_FAMILIES.find((f) => this.contacts.find(f, key));
    if (!family) {
      throw new UsageError("contact_not_found", `contact not found: ${name}`);
    }
    return publicContact(this.contacts.remove(family, key));
  }
}

/** The user-facing shape: a name, an address, a note. No family — the address already says which
 *  chain it is, and family is an internal bucketing/routing detail. */
function publicContact(entry: ContactEntry): ContactView {
  return { name: entry.name, address: entry.address, note: entry.note };
}
