/**
 * `asset` — TRC10, the TRON protocol's own token type (issuance, ICO window, frozen supply).
 * TRC20 contracts live under `token`; TRC10 *transfer* is `tx send` with an asset id.
 *
 * Deviations from the v4.12.0 command spec for this group are recorded in
 * docs/asset-exchange-spec-deviations-v4.12.0.md — notably: Ledger cannot sign any of these
 * contract types, `asset list` defaults to one page rather than the whole chain, and an ambiguous
 * token name is an error rather than a differently-shaped result.
 */
import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";
import type { TronAssetService } from "../../../../application/use-cases/tron/asset-service.js";
import { txModeFields } from "./shared.js";
import { Schemas } from "../schemas/index.js";
import { TextFormatters } from "../render/index.js";

const LEDGER_NOTE =
  "The Ledger TRON app cannot decode TRC10 issuance contracts, so this command needs a software account.";

const assetReference = z
  .string()
  .min(1)
  .describe("token id or name; a numeric value is read as the id");

export const assetIssueSpec: ChainSpec = {
  path: ["asset", "issue"],
  network: "optional",
  wallet: "optional",
  auth: "conditional",
  broadcasts: true,
  capability: "asset.issue",
  summary: "Issue a TRC10 token and lock in its ICO terms",
  description:
    "Issue a TRC10 token and lock in its ICO terms at the same time.\n\n" +
    "IRREVERSIBLE: the issuance fee is burned and an account can only ever issue ONE\n" +
    "TRC10 token — you cannot amend or re-issue. Only the description, URL and the two\n" +
    "free bandwidth limits stay changeable afterward (see 'asset update'); everything\n" +
    "else is fixed at issuance. Note --price is converted using --precision, so the\n" +
    "same --price at a different --precision yields a different on-chain rate.",
  requires: [
    "an account that has never issued a TRC10, with balance >= the issuance fee",
    LEDGER_NOTE,
  ],
  baseFields: z.object({
    name: z.string().min(1).describe("token name, 1-32 visible ASCII chars"),
    supply: z.string().min(1).describe("total supply, in whole tokens"),
    price: z.string().min(1).describe("ICO rate in whole TRX to whole tokens, e.g. 1:100"),
    start: z
      .string()
      .min(1)
      .describe(
        'ICO start, YYYY-MM-DD or "YYYY-MM-DD HH:mm:ss", read as UTC; must be in the future',
      ),
    end: z.string().min(1).describe("ICO end, same format, must be after --start"),
    url: z.string().describe("project page, must not be empty"),
    abbr: z.string().optional().describe("token abbreviation"),
    precision: z.coerce.number().int().min(0).max(6).default(0).describe("decimal places"),
    description: z.string().optional().describe("short description, up to 200 bytes"),
    freeNetPerAccount: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe("free bandwidth each holder may use"),
    publicFreeNet: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe("shared free bandwidth pool for holders"),
    // repeatable: the arity layer sets yargs `array: true`, so this always arrives as string[]
    freeze: z
      .array(z.string().min(1))
      .optional()
      .describe("frozen tranche <amount>:<days>, amount in whole tokens; repeatable"),
    ...txModeFields,
  }),
  examples: [
    {
      cmd: "wallet-cli asset issue --name MyToken --supply 1000000000 --price 1:100 --start 2026-08-01 --end 2026-08-31 --url https://mytoken.io --wait",
    },
  ],
  formatText: TextFormatters.txReceipt,
};

export const assetUpdateSpec: ChainSpec = {
  path: ["asset", "update"],
  network: "optional",
  wallet: "optional",
  auth: "conditional",
  broadcasts: true,
  capability: "asset.update",
  summary: "Update the mutable fields of the TRC10 you issued",
  description:
    "Update the mutable fields of the TRC10 you issued. There is no token argument:\n" +
    "it always targets the token issued by the signing account.\n\n" +
    "Only these four fields can ever be changed. Supply, ICO price, ICO dates,\n" +
    "precision and the frozen tranches were fixed at issuance and cannot be altered.\n\n" +
    "Pass only the fields you want to change; the others are read from chain and\n" +
    "written back unchanged. At least one field is required.",
  requires: ["an account that has issued a TRC10", LEDGER_NOTE],
  baseFields: z.object({
    description: z.string().optional().describe("new description, up to 200 bytes"),
    url: z.string().optional().describe("new project page, must not be empty"),
    freeNetPerAccount: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe("free bandwidth each holder may use"),
    publicFreeNet: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe("shared free bandwidth pool for holders"),
    ...txModeFields,
  }),
  examples: [{ cmd: "wallet-cli asset update --url https://mytoken.io/v2 --wait" }],
  formatText: TextFormatters.txReceipt,
};

export const assetParticipateSpec: ChainSpec = {
  path: ["asset", "participate"],
  network: "optional",
  wallet: "optional",
  auth: "conditional",
  broadcasts: true,
  capability: "asset.participate",
  summary: "Buy into a TRC10's ICO at its fixed rate",
  description:
    "Buy into a TRC10's ICO during its funding window, at the fixed rate set when the\n" +
    "token was issued. This is participation in the issuance, not a market trade.\n\n" +
    "--pay is the amount of TRX you spend, NOT the number of tokens you receive.\n" +
    "Tokens are rounded DOWN to a whole unit and the TRX you paid is transferred in\n" +
    "full, so a truncated remainder is not refunded. Paying too little to buy even one\n" +
    "unit is rejected before broadcast. The issuer's address is resolved from the\n" +
    "token automatically.",
  requires: ["an account with enough TRX, other than the token's issuer", LEDGER_NOTE],
  positionals: [{ field: "assetRef", placeholder: "asset" }],
  baseFields: z.object({
    assetRef: assetReference,
    pay: z.string().min(1).describe("TRX to spend (decimal, not the number of tokens)"),
    ...txModeFields,
  }),
  examples: [{ cmd: "wallet-cli asset participate 1000124 --pay 100 --wait" }],
  formatText: TextFormatters.txReceipt,
};

export const assetUnfreezeSpec: ChainSpec = {
  path: ["asset", "unfreeze"],
  network: "optional",
  wallet: "optional",
  auth: "conditional",
  broadcasts: true,
  capability: "asset.unfreeze",
  summary: "Release the matured frozen supply of the TRC10 you issued",
  description:
    "Release the frozen supply of the TRC10 you issued, once its lock period is over.\n" +
    "There is no argument: it always targets the token issued by the signing account,\n" +
    "and every tranche that has matured is released in one transaction. Tranches that\n" +
    "have not matured yet are untouched — run it again later for those.\n\n" +
    "This is unrelated to 'stake unfreeze', which releases staked TRX.",
  requires: ["an account that has issued a TRC10 and has matured frozen supply", LEDGER_NOTE],
  baseFields: z.object({ ...txModeFields }),
  examples: [{ cmd: "wallet-cli asset unfreeze --wait" }],
  formatText: TextFormatters.txReceipt,
};

export const assetInfoSpec: ChainSpec = {
  path: ["asset", "info"],
  network: "optional",
  wallet: "none",
  auth: "none",
  capability: "asset.info",
  summary: "Show a TRC10 in full",
  description:
    "Show a TRC10 in full: issuer, supply, precision, ICO rate and window, frozen\n" +
    "tranches, description and URL.\n\n" +
    "Give exactly one of the <asset> argument or --issuer.\n\n" +
    "Token names are not guaranteed unique. A name matching more than one token is an\n" +
    "error listing the matching ids — re-run with the id you want.",
  // The choice here is between a positional and a flag; `exclusive` groups model flag-vs-flag
  // only, so the constraint is stated above and enforced in the service.
  positionals: [{ field: "assetRef", placeholder: "asset" }],
  baseFields: z.object({
    assetRef: assetReference.optional(),
    issuer: Schemas.addressFor("tron")
      .optional()
      .describe("look up the token issued by this address"),
  }),
  examples: [
    { cmd: "wallet-cli asset info 1000123" },
    { cmd: "wallet-cli asset info MyToken" },
    { cmd: "wallet-cli asset info --issuer TQkXm4vN...5Zt7Uw" },
  ],
  formatText: TextFormatters.assetInfo,
};

export const assetListSpec: ChainSpec = {
  path: ["asset", "list"],
  network: "optional",
  wallet: "none",
  auth: "none",
  capability: "asset.list",
  summary: "List TRC10 tokens, one page at a time",
  description:
    "List TRC10 tokens with id, name, total supply, precision and issuer.\n\n" +
    "Paged server-side; there are thousands of TRC10s on chain, so raise --limit\n" +
    "deliberately rather than expecting the whole list. No total is reported — the\n" +
    "chain does not return one without transferring every record.\n" +
    "Use 'asset info' for the full detail of one token.",
  baseFields: z.object({
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(1000)
      .default(10)
      .describe("max tokens to return"),
    offset: z.coerce.number().int().min(0).default(0).describe("pagination offset"),
  }),
  examples: [
    { cmd: "wallet-cli asset list" },
    { cmd: "wallet-cli asset list --limit 50 --offset 50" },
  ],
  formatText: TextFormatters.assetList,
};

export function assetDefinitions(
  svc: TronAssetService,
): Array<{ spec: ChainSpec; binding: FamilyBinding }> {
  return [
    { spec: assetIssueSpec, binding: { run: (ctx, net, input) => svc.issue(ctx, net, input) } },
    { spec: assetUpdateSpec, binding: { run: (ctx, net, input) => svc.update(ctx, net, input) } },
    {
      spec: assetParticipateSpec,
      binding: { run: (ctx, net, input) => svc.participate(ctx, net, input) },
    },
    {
      spec: assetUnfreezeSpec,
      binding: { run: (ctx, net, input) => svc.unfreeze(ctx, net, input) },
    },
    { spec: assetInfoSpec, binding: { run: (_ctx, net, input) => svc.info(net, input) } },
    { spec: assetListSpec, binding: { run: (_ctx, net, input) => svc.list(net, input) } },
  ];
}
