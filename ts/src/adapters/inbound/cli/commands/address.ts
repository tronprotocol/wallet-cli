import { z } from "zod";
import type { CommandDefinition } from "../contracts/index.js";
import type { CommandRegistry } from "../registry/index.js";
import type { AddressService } from "../../../../application/use-cases/address-service.js";
import { TextFormatters } from "../render/index.js";

export function registerAddressCommands(registry: CommandRegistry, service: AddressService): void {
  const fields = z.object({
    // The default lives in SecureKeypairWriter, not in this schema, so it is stated in prose:
    // a "[optional, default: …]" tag is derived from zod and would claim a default --json-schema
    // does not have. Readers need the location before running, not only in the receipt.
    out: z
      .string()
      .min(1)
      .max(4096)
      .optional()
      .describe(
        "exclusive 0600 output path; existing files are never overwritten (default: <wallet-cli root>/generated/keypair-<address>)",
      ),
    printSecret: z
      .boolean()
      .default(false)
      .describe("print the private key instead of writing it; use only offline"),
  });
  registry.add({
    path: ["address", "generate"],
    network: "none",
    wallet: "none",
    auth: "none",
    summary: "Generate a random TRON/EVM keypair locally without adding it to the wallet",
    description:
      "Generate a secp256k1 keypair offline. By default the private key is written exclusively to a 0600 file and never printed or added to the keystore.\n" +
      "The TRON and EVM addresses shown are two encodings of the same generated key.",
    fields,
    input: fields,
    examples: [
      { cmd: "wallet-cli address generate" },
      {
        cmd: "wallet-cli address generate --out /secure/usb/key.json",
      },
    ],
    formatText: TextFormatters.addressGenerate,
    run: async (_context, _network, input) => service.generate(input),
  } satisfies CommandDefinition);
}
