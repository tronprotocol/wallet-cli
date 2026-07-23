import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";
import type { GasFreeService } from "../../../../application/use-cases/tron/gasfree-service.js";
import { TextFormatters } from "../render/index.js";

export const gasFreeInfoSpec: ChainSpec = {
  path: ["gasfree", "info"],
  network: "optional",
  wallet: "optional",
  auth: "none",
  capability: "gasfree.info",
  requires: [
    "config gasfreeApiKey / gasfreeApiSecret",
  ],
  summary: "Show GasFree address, activation status, nonce, balances, and fees",
  description:
    "Show this account's GasFree address, activation status, nonce, supported tokens, balances, and current token-denominated fees.",
  baseFields: z.object({}),
  examples: [{ cmd: "wallet-cli gasfree info" }],
  formatText: TextFormatters.gasFreeInfo,
};

export const gasFreeInfoTronBinding = (
  service: GasFreeService,
): FamilyBinding => ({
  run: async (context, network) => service.info(context, network),
});

const transferFields = z.object({
  to: z.string().trim().min(1).max(128)
    .describe("recipient TRON address or local contact name"),
  amount: z.string().regex(/^\d+(\.\d+)?$/, "must be a positive decimal amount")
    .refine(
      (value) => !/^0+(\.0+)?$/.test(value),
      "must be greater than zero",
    ),
  token: z.string().trim().min(1).max(32).default("USDT"),
  dryRun: z.boolean().default(false),
});

export const gasFreeTransferSpec: ChainSpec = {
  path: ["gasfree", "transfer"],
  network: "optional",
  wallet: "optional",
  auth: "required",
  broadcasts: true,
  capability: "gasfree.transfer",
  requires: [
    "config gasfreeApiKey / gasfreeApiSecret",
  ],
  summary: "Sign and submit a TIP-712 GasFree token transfer",
  description:
    "Sign a GasFree PermitTransfer and submit it to the provider. No TRX is needed; --dry-run checks the token balance and fee breakdown without unlocking or signing.",
  baseFields: transferFields,
  baseRefine: (value, context) => {
    if (value.dryRun && value.wait) {
      context.addIssue({
        code: "custom",
        path: ["dryRun"],
        message: "--dry-run cannot be combined with --wait",
      });
    }
  },
  examples: [
    {
      cmd: "wallet-cli gasfree transfer --to T... --amount 25 --password-stdin",
    },
    {
      cmd: "wallet-cli gasfree transfer --to alice --amount 25 --wait --password-stdin",
    },
  ],
  formatText: TextFormatters.gasFreeTransfer,
};

export const gasFreeTransferTronBinding = (
  service: GasFreeService,
): FamilyBinding => ({
  run: async (context, network, input) =>
    service.transfer(context, network, input),
});

const traceFields = z.object({
  traceId: z.string().trim().min(1).max(128)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
});

export const gasFreeTraceSpec: ChainSpec = {
  path: ["gasfree", "trace"],
  network: "optional",
  wallet: "none",
  auth: "none",
  capability: "gasfree.trace",
  requires: [
    "config gasfreeApiKey / gasfreeApiSecret",
  ],
  positionals: [{ field: "traceId", placeholder: "traceId" }],
  summary: "Track a GasFree transfer by provider trace id",
  description:
    "Track a submitted GasFree transfer through WAITING, INPROGRESS, CONFIRMING, and the SUCCEED or FAILED terminal state.",
  baseFields: traceFields,
  examples: [
    {
      cmd: "wallet-cli gasfree trace 7f3e9a02-58c1-4d2e-b6a4-91d0c3f8e527",
    },
  ],
  formatText: TextFormatters.gasFreeTrace,
};

export const gasFreeTraceTronBinding = (
  service: GasFreeService,
): FamilyBinding => ({
  run: async (_context, network, input) =>
    service.trace(network, input.traceId),
});
