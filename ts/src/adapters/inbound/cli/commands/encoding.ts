import { z } from "zod";
import type { CommandDefinition } from "../contracts/index.js";
import type { CommandRegistry } from "../registry/index.js";
import type { EncodingService } from "../../../../application/use-cases/encoding-service.js";
import { TextFormatters } from "../render/index.js";

export function registerEncodingCommands(
  registry: CommandRegistry,
  service: EncodingService,
): void {
  const fields = z.object({
    input: z.string().min(1).max(2 * 1024 * 1024),
  });
  registry.add({
    path: ["encoding", "convert"],
    network: "none",
    wallet: "none",
    auth: "none",
    positionals: [{ field: "input" }],
    summary:
      "Convert and validate address, hex, Base64, and Base58Check encodings",
    description:
      "Auto-detect an address/public-key or generic encoding and print all equivalent forms. Runs locally; 32-byte private-key-shaped values are rejected from argv.",
    fields,
    input: fields,
    examples: [
      { cmd: "wallet-cli encoding convert TBhC..." },
      { cmd: "wallet-cli encoding convert deadbeef0102" },
    ],
    formatText: TextFormatters.encodingConvert,
    run: async (_context, _network, input) =>
      service.convert(input.input),
  } satisfies CommandDefinition);
}
