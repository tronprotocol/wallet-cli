import { z } from "zod";
import type { CommandDefinition } from "../contracts/index.js";
import type { CommandRegistry } from "../registry/index.js";
import type { ContactService } from "../../../../application/use-cases/contact-service.js";
import { TextFormatters } from "../render/index.js";

export function registerContactCommands(
  registry: CommandRegistry,
  service: ContactService,
): void {
  const addFields = z.object({
    name: z.string().min(1).max(256),
    address: z.string().min(1).max(128),
    note: z.string().max(512).optional()
      .describe("free-form note, up to 128 safe characters"),
  });
  registry.add({
    path: ["contact", "add"],
    network: "none",
    wallet: "none",
    auth: "none",
    positionals: [{ field: "name" }, { field: "address" }],
    summary: "Add a recipient",
    description:
      "Add a locally stored TRON recipient. The Base58Check address is validated and the name can then be used by tx send and gasfree transfer.",
    fields: addFields,
    input: addFields,
    examples: [{
      cmd: "wallet-cli contact add alice TBy6... --note 'Alice mainnet'",
    }],
    formatText: TextFormatters.contactAdd,
    run: async (_context, _network, input) =>
      service.add(input.name, input.address, input.note),
  } satisfies CommandDefinition);

  const empty = z.object({});
  registry.add({
    path: ["contact", "list"],
    network: "none",
    wallet: "none",
    auth: "none",
    summary: "List recipients",
    description:
      "List every recipient in the local plaintext address book.",
    fields: empty,
    input: empty,
    examples: [{ cmd: "wallet-cli contact list" }],
    formatText: TextFormatters.contactList,
    run: async () => service.list(),
  } satisfies CommandDefinition);

  const removeFields = z.object({
    name: z.string().min(1).max(256),
  });
  registry.add({
    path: ["contact", "remove"],
    network: "none",
    wallet: "none",
    auth: "none",
    positionals: [{ field: "name" }],
    summary: "Remove a recipient",
    description:
      "Remove one recipient from the local address book without changing any on-chain state.",
    fields: removeFields,
    input: removeFields,
    examples: [{ cmd: "wallet-cli contact remove alice" }],
    formatText: TextFormatters.contactRemove,
    run: async (_context, _network, input) => service.remove(input.name),
  } satisfies CommandDefinition);
}
