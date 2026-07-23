import type {
  ContactListView,
  ContactView,
} from "../../../../domain/types/index.js";
import { ok, receipt, table } from "./layout.js";

export const ContactFormatters = {
  contactAdd: (value: ContactView): string => receipt(
    ok(),
    "Contact added",
    [
      ["Name", value.name],
      ["Address", value.address],
      ["Note", value.note ?? "—"],
    ],
  ),
  contactRemove: (value: ContactView): string => receipt(
    ok(),
    "Contact removed",
    [
      ["Name", value.name],
      ["Address", value.address],
    ],
  ),
  contactList: (value: ContactListView): string => table(
    ["Name", "Address", "Note"],
    value.contacts.map((entry) => [
      entry.name,
      entry.address,
      entry.note ?? "—",
    ]),
  ),
};
