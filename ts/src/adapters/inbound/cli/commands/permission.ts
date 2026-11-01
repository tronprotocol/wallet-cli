import { isLosslessNumber, parse as parseLosslessJson } from "lossless-json";
import { z } from "zod";
import type { TronPermissionService } from "../../../../application/use-cases/tron/permission-service.js";
import { UsageError } from "../../../../domain/errors/index.js";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";
import { TextFormatters } from "../render/index.js";
import { readBoundedTextFile } from "./artifact.js";
import { tronExpirationRefine, txModeFields, tronTxModeFields, txModeExclusive } from "./shared.js";

const showFields = z.object({});

export const permissionShowSpec: ChainSpec = {
  path: ["permission", "show"],
  network: "optional",
  wallet: "optional",
  auth: "none",
  capability: "permission.read",
  summary: "Show owner, witness, and active permission groups",
  description:
    "Show thresholds, authorized keys, and decoded operation bitmaps. --account may be a local account or any activated TRON address.",
  baseFields: showFields,
  examples: [
    { cmd: "wallet-cli permission show" },
    { cmd: "wallet-cli permission show --account T... -o json" },
  ],
  formatText: TextFormatters.permissionShow,
};

const updateFields = z.object({
  file: z.string().min(1).optional().describe("complete replacement permission JSON file"),
  json: z.string().min(1).optional().describe("inline complete replacement permission JSON"),
  dryRun: z
    .boolean()
    .default(false)
    .describe("validate, build, and estimate without signing or broadcasting"),
  signOnly: z
    .boolean()
    .default(false)
    .describe("build and sign, then output complete transaction hex"),
  buildOnly: txModeFields.buildOnly,
  permissionId: tronTxModeFields.permissionId,
  expiration: tronTxModeFields.expiration,
});

export const permissionUpdateSpec: ChainSpec = {
  path: ["permission", "update"],
  network: "optional",
  wallet: "optional",
  auth: "conditional",
  broadcasts: true,
  capability: "permission.update",
  summary: "Replace the complete account permission structure",
  description:
    "Replaces owner/witness/active permissions in one AccountPermissionUpdateContract. The input is\n" +
    "the complete structure, in the same shape as `permission show -o json` data.\n" +
    "There is no confirmation prompt: it warns about a permanent lockout but does not block the\n" +
    "submission, so rehearse with --dry-run first.",
  baseFields: updateFields,
  exclusive: [{ label: "the new permission structure", flags: ["file", "json"] }, txModeExclusive],
  baseRefine: tronExpirationRefine,
  examples: [
    { cmd: "wallet-cli permission update --file permissions.json --dry-run" },
    { cmd: "wallet-cli permission update --file permissions.json --wait --password-stdin" },
  ],
  formatText: TextFormatters.permissionUpdate,
};

export const permissionShowTronBinding = (service: TronPermissionService): FamilyBinding => ({
  run: async (ctx, network) => service.show(ctx.deadline, network, ctx.resolveAddress("tron")),
});

export const permissionUpdateTronBinding = (service: TronPermissionService): FamilyBinding => ({
  run: async (ctx, network, input) => {
    const raw = input.file
      ? readBoundedTextFile(input.file, 1024 * 1024, "permission JSON file")
      : input.json;
    let parsed: unknown;
    try {
      parsed = normalizeLossless(parseLosslessJson(raw));
    } catch {
      throw new UsageError("invalid_permission", "permission structure must be valid JSON");
    }
    return service.update(ctx, network, input, parsed);
  },
});

function normalizeLossless(value: unknown): unknown {
  if (isLosslessNumber(value)) {
    const exact = value.toString();
    const number = Number(exact);
    return Number.isSafeInteger(number) ? number : exact;
  }
  if (Array.isArray(value)) return value.map(normalizeLossless);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeLossless(entry)]),
    );
  }
  return value;
}
