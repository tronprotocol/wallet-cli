import { isLosslessNumber, parse as parseLosslessJson } from "lossless-json";
import { z } from "zod";
import type { TronPermissionService } from "../../../../application/use-cases/tron/permission-service.js";
import { UsageError } from "../../../../domain/errors/index.js";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";
import { TextFormatters } from "../render/index.js";
import { exactlyOne, readBoundedTextFile } from "./artifact.js";

const showFields = z.object({});

export const permissionShowSpec: ChainSpec = {
  path: ["permission", "show"],
  network: "optional",
  wallet: "optional",
  auth: "none",
  capability: "permission.read",
  summary: "Show owner, witness, and active permission groups",
  description: "Show thresholds, authorized keys, and decoded operation bitmaps. --account may be a local account or any activated TRON address.",
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
  dryRun: z.boolean().default(false).describe("validate, build, and estimate without signing or broadcasting"),
  signOnly: z.boolean().default(false).describe("build and sign, then output complete transaction hex"),
  buildOnly: z.boolean().default(false).describe("build and output unsigned complete transaction hex without unlocking"),
  permissionId: z.number().int().min(0).max(9).default(0).describe("TRON permission group id used to authorize this transaction"),
  expiration: z.number().int().min(1).max(86_400_000).optional().describe("expiration duration in milliseconds; only with --sign-only or --build-only"),
});

export const permissionUpdateSpec: ChainSpec = {
  path: ["permission", "update"],
  network: "optional",
  wallet: "optional",
  auth: "required",
  broadcasts: true,
  capability: "permission.update",
  summary: "Replace the complete account permission structure",
  description: "Replaces owner/witness/active permissions in one AccountPermissionUpdateContract. Misconfiguration can permanently lock the account; use --dry-run first.",
  baseFields: updateFields,
  baseRefine: (input, context) => {
    if ([input.file, input.json].filter((value) => value !== undefined).length !== 1) {
      context.addIssue({ code: "custom", path: ["file"], message: "provide exactly one of --file or --json" });
    }
    if ([input.dryRun, input.signOnly, input.buildOnly].filter(Boolean).length > 1) {
      context.addIssue({ code: "custom", path: ["dryRun"], message: "choose at most one of --dry-run, --sign-only, --build-only" });
    }
    if (input.expiration !== undefined && !input.signOnly && !input.buildOnly) {
      context.addIssue({ code: "custom", path: ["expiration"], message: "--expiration is only valid with --sign-only or --build-only" });
    }
  },
  examples: [
    { cmd: "wallet-cli permission update --file permissions.json --dry-run" },
    { cmd: "wallet-cli permission update --file permissions.json --wait --password-stdin" },
  ],
  formatText: TextFormatters.permissionUpdate,
};

export const permissionShowTronBinding = (service: TronPermissionService): FamilyBinding => ({
  run: async (ctx, network) => service.show(network, ctx.resolveAddress("tron")),
});

export const permissionUpdateTronBinding = (service: TronPermissionService): FamilyBinding => ({
  run: async (ctx, network, input) => {
    exactlyOne([input.file, input.json], "provide exactly one of --file or --json");
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
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalizeLossless(entry)]));
  }
  return value;
}
