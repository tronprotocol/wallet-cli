/**
 * `sunpump launch` — create a token on the SunPump launchpad.
 *
 * Unlike every other write in this group, the SERVICE creates the token: nothing is signed here,
 * nothing is broadcast, no fee is paid locally, and the request body carries no address at all. So
 * this command needs no account and no unlock, has no `--wait`, no `--build-only` and no three-stage
 * receipt — and it REFUSES `--account`, because the new token's creator is chosen by SunPump and is
 * not the local account.
 *
 * Everything refused below is refused before anything is sent. It has to be: this service ignores
 * what it does not understand and accepts the rest, so a link it cannot use is not an error, it is
 * a token created with a broken link.
 */
import { z } from "zod";
import type { RefinementCtx } from "zod";
import { readFile } from "node:fs/promises";
import type { ChainSpec, FamilyBinding } from "../../contracts/command.js";
import type { SunPumpTokenLaunchService } from "../../../../../application/use-cases/tron/sunpump/token-launch-service.js";
import type { SunPumpLaunchImage } from "../../../../../application/use-cases/tron/sunpump/token-launch-service.js";
import { UsageError } from "../../../../../domain/errors/index.js";
import { TextFormatters } from "../../render/index.js";

/**
 * The name, symbol and description carry NO local rules.
 *
 * Their limits are the service's — length, character set, whether a symbol is already taken — and
 * they are not published anywhere we can read. A local guess would refuse a name SunPump accepts,
 * or accept one it rejects, and the second is honest while the first is a lie. A rejection comes
 * back as `provider_error` with the service's own message.
 */
const fields = z.object({
  name: z.string().describe("token name"),
  symbol: z.string().describe("token symbol"),
  description: z.string().describe("token description"),
  image: z.string().optional().describe("path to a logo image file, sent as base64"),
  imageBase64: z
    .string()
    .optional()
    .describe("the logo as a base64 string; mutually exclusive with --image"),
  twitterUrl: z.string().optional().describe("Twitter URL"),
  telegramUrl: z.string().optional().describe("Telegram URL"),
  websiteUrl: z.string().optional().describe("website URL"),
  dryRun: z.boolean().default(false).describe("validate and preview without sending"),
});

const URL_FIELDS = ["twitterUrl", "telegramUrl", "websiteUrl"] as const;

/**
 * Two refusals, both knowable with no network at all.
 *
 * A link that is not `http://` or `https://` is refused rather than sent: the service stores what
 * it is given, so `example.com` becomes a token whose website link goes nowhere and cannot be
 * changed afterwards. Two image sources are refused rather than one silently winning — the caller
 * who gave both does not know which logo their token would carry.
 */
function refuseUnusableOptions(value: Record<string, unknown>, ctx: RefinementCtx): void {
  if (value.image !== undefined && value.imageBase64 !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["imageBase64"],
      message: "cannot be given with --image; they are two ways of supplying one logo",
      params: { errorCode: "invalid_option" },
    });
  }
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
  // Nothing local signs, and there is no owner to resolve: the token's creator comes back from the
  // service. Accepting `--account` would imply the token is that account's, so it is refused.
  wallet: "none",
  auth: "none",
  rejectsAccount:
    "the token is created by SunPump, which chooses its owner, and nothing here is signed locally",
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

/**
 * The logo, read here because reading a path is this layer's job.
 *
 * `--image` is read even for a dry run — a preview whose file does not exist has validated nothing
 * — and the bytes are base64-encoded as they are, with no `data:` prefix and no re-encoding: what
 * the file holds is what the token's logo will be.
 */
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
      throw new UsageError("file_not_found", `image file not found: ${path}`);
    }
    throw new UsageError("invalid_value", `cannot read image file: ${path}`);
  }
  return {
    image: { source: "file", path, bytes: bytes.byteLength, base64: bytes.toString("base64") },
  };
}
