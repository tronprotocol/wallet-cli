import type { ContactRepository } from "../ports/contact-repository.js";
import type {
  ContactEntry,
  ContactListView,
  ContactView,
} from "../../domain/types/index.js";
import {
  contactNameKey,
  createContact,
} from "../../domain/contact/index.js";

export class ContactService {
  constructor(private readonly contacts: ContactRepository) {}

  add(name: string, address: string, note?: string): ContactView {
    return publicContact(
      this.contacts.add(createContact("tron", name, address, note)),
    );
  }

  list(): ContactListView {
    return { contacts: this.contacts.list("tron").map(publicContact) };
  }

  remove(name: string): ContactView {
    return publicContact(
      this.contacts.remove("tron", contactNameKey(name)),
    );
  }
}

function publicContact(entry: ContactEntry): ContactView {
  return {
    name: entry.name,
    address: entry.address,
    note: entry.note,
    family: entry.family,
  };
}
