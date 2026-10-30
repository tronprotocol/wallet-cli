import { z } from "zod";
import type { RefinementCtx } from "zod";
import { readFile } from "node:fs/promises";
import type { ChainSpec, FamilyBinding } from "../../contracts/command.js";
import type { SunPumpTokenLaunchService } from "../../../../../application/use-cases/tron/sunpump/token-launch-service.js";
import type { SunPumpLaunchImage } from "../../../../../application/use-cases/tron/sunpump/token-launch-service.js";
import { errorMessage, UsageError } from "../../../../../domain/errors/index.js";
import { TextFormatters } from "../../render/index.js";

// SunPump validates name, symbol, and description constraints.
const fields = z.object({
  name: z.string().describe("token name"),
  symbol: z.string().describe("token symbol"),
  description: z.string().describe("token description"),
  image: z.string().optional().describe("path to a logo image file, sent as base64"),
  imageBase64: z.string().optional().describe("the logo as a base64 string"),
  twitterUrl: z.string().optional().describe("Twitter URL"),
  telegramUrl: z.string().optional().describe("Telegram URL"),
  websiteUrl: z.string().optional().describe("website URL"),
  dryRun: z.boolean().default(false).describe("validate and preview without sending"),
});

const URL_FIELDS = ["twitterUrl", "telegramUrl", "websiteUrl"] as const;

function refuseUnusableOptions(value: Record<string, unknown>, ctx: RefinementCtx): void {
  for (const field of URL_FIELDS) {
    const url = value[field];
    if (typeof url === "string" && !/^https?:\/\//.test(url)) {
      ctx.addIssue({
        code: "custom",
        path: [field],
        message: "must start with http:// or https://",
      });
    }
  }
}

export const sunpumpLaunchSpec: ChainSpec = {
  path: ["sunpump", "launch"],
  network: "optional",
  wallet: "none",
  auth: "none",
  rejectsAccount:
    "the token is created by SunPump, which chooses its owner, and nothing here is signed locally",
  rejectsWait: "the token is created by SunPump and no transaction comes back to wait for",
  capability: "sunpump.launch",
  summary: "Create a new token on the bonding curve",
  description:
    "Create a new token on SunPump's bonding curve (status CREATED); it launches to SunSwap once the curve fills.\n" +
    "The token is created server-side; no local signing is involved, and the new token is not tied to any local account.\n\n" +
    "The creator — the token's `owner` — is chosen by SunPump and is NOT your active account. You\n" +
    "pay no fee, sign nothing, and the new token is not yours to move: trade it on the curve with\n" +
    "`sunpump buy` / `sunpump sell` like any other SunPump token.\n\n" +
    "The name and the symbol are judged by SunPump, not here: a name it will not take, or a symbol\n" +
    "already in use, comes back as provider_error with its own message. Nothing is checked locally\n" +
    "that the service would accept.\n\n" +
    "--dry-run sends nothing to the create endpoint: it validates the options, reads the logo file,\n" +
    "and prints the request that would be made.",
  exclusive: [{ label: "the logo", flags: ["image", "image-base64"], select: "at-most-one" }],
  baseFields: fields,
  baseRefine: refuseUnusableOptions,
  examples: [
    {
      cmd: 'wallet-cli sunpump launch --name "My Token" --symbol MYT --description "a demo token" --dry-run',
    },
    {
      cmd: 'wallet-cli sunpump launch --name "My Token" --symbol MYT --description "a demo token" --network tron',
      note: "creates a real, permanent token",
    },
  ],
  formatText: TextFormatters.sunpumpLaunch,
};

export const sunpumpLaunchTronBinding = (service: SunPumpTokenLaunchService): FamilyBinding => ({
  run: async (_ctx, net, input) =>
    service.launch(net, {
      name: input.name,
      symbol: input.symbol,
      description: input.description,
      ...(await imageOf(input)),
      ...(input.twitterUrl === undefined ? {} : { twitterUrl: input.twitterUrl }),
      ...(input.telegramUrl === undefined ? {} : { telegramUrl: input.telegramUrl }),
      ...(input.websiteUrl === undefined ? {} : { websiteUrl: input.websiteUrl }),
      dryRun: input.dryRun === true,
    }),
});

// Read files even for dry runs; encode their bytes as base64 without a data: prefix.
async function imageOf(input: {
  image?: string;
  imageBase64?: string;
}): Promise<{ image?: SunPumpLaunchImage }> {
  if (input.imageBase64 !== undefined) {
    return { image: { source: "base64", base64: input.imageBase64 } };
  }
  const path = input.image;
  if (path === undefined) return {};
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new UsageError("file_not_found", errorMessage`image file not found: ${path}`);
    }
    throw new UsageError("invalid_value", errorMessage`cannot read image file: ${path}`);
  }
  return {
    image: { source: "file", path, bytes: bytes.byteLength, base64: bytes.toString("base64") },
  };
}
