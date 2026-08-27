import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";
import type { TronWitnessService } from "../../../../application/use-cases/tron/witness-service.js";
import { governanceTxModeFields, governanceTxRefine } from "./shared.js";
import { TextFormatters } from "../render/index.js";

const witnessUrl = z
  .string()
  .trim()
  .min(1)
  .refine((value) => Buffer.byteLength(value, "utf8") <= 256, "must not exceed 256 UTF-8 bytes")
  .describe("candidate information-page URL (max 256 UTF-8 bytes)");

const witnessWriteBase = {
  network: "optional" as const,
  wallet: "optional" as const,
  auth: "required" as const,
  broadcasts: true,
  capability: "witness.manage",
  baseRefine: governanceTxRefine,
  formatText: TextFormatters.governanceReceipt,
};

export const witnessCreateSpec: ChainSpec = {
  path: ["witness", "create"],
  ...witnessWriteBase,
  summary: "Register as a super representative candidate",
  description:
    "Register the account as an SR candidate. The chain burns a fee set by an on-chain parameter\n" +
    "from the account balance; the fee is irreversible and registration cannot be undone.",
  requires: ["an activated account funded for the on-chain registration burn"],
  baseFields: z.object({ url: witnessUrl, ...governanceTxModeFields }),
  examples: [{ cmd: "wallet-cli witness create --url https://sr.example --wait" }],
};

export const witnessCreateTronBinding = (service: TronWitnessService): FamilyBinding => ({
  run: async (ctx, net, input) => service.create(ctx, net, input),
});

export const witnessUpdateSpec: ChainSpec = {
  path: ["witness", "update"],
  ...witnessWriteBase,
  summary: "Update an SR candidate URL",
  requires: ["a registered witness account"],
  baseFields: z.object({ url: witnessUrl, ...governanceTxModeFields }),
  examples: [{ cmd: "wallet-cli witness update --url https://sr.example/v2 --wait" }],
};

export const witnessUpdateTronBinding = (service: TronWitnessService): FamilyBinding => ({
  run: async (ctx, net, input) => service.update(ctx, net, input),
});

export const witnessSetBrokerageSpec: ChainSpec = {
  path: ["witness", "set-brokerage"],
  ...witnessWriteBase,
  positionals: [{ field: "percent" }],
  summary: "Set the SR reward brokerage percentage",
  description:
    "Set the percentage of block rewards retained by the SR. The remaining percentage is\n" +
    "distributed to voters; the value is not reversed from Java wallet-cli brokerage.",
  requires: ["a registered witness account"],
  baseFields: z.object({
    percent: z.coerce
      .number()
      .int()
      .min(0)
      .max(100)
      .describe("percentage retained by the SR (0-100)"),
    ...governanceTxModeFields,
  }),
  examples: [{ cmd: "wallet-cli witness set-brokerage 20 --wait" }],
};

export const witnessSetBrokerageTronBinding = (service: TronWitnessService): FamilyBinding => ({
  run: async (ctx, net, input) => service.setBrokerage(ctx, net, input),
});
