import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";
import { UsageError } from "../../../../domain/errors/index.js";
import { normalizeTypedData } from "../../../../domain/typed-data/index.js";
import type { TypedDataService } from "../../../../application/use-cases/typed-data-service.js";
import { TextFormatters } from "../render/index.js";

const typedDataFields = z.object({
  typedData: z.string().min(1)
    .describe(`EIP-712/TIP-712 JSON: {"domain":…,"types":…,"primaryType"?:…,"message":…}`),
});

export const typedDataSignSpec: ChainSpec = {
  path: ["typed-data", "sign"],
  network: "optional", wallet: "optional", auth: "required",
  broadcasts: false,
  capability: "typedData.sign",
  summary: "Sign EIP-712 / TIP-712 structured data",
  description:
    "Prints the signature, the digest that was signed, and the primary type.\n" +
    "`EIP712Domain` in `types` is ignored, `value` is accepted for `message`, and TRON base58\n" +
    "addresses work in address fields.",
  baseFields: typedDataFields,
  examples: [
    { cmd: `wallet-cli typed-data sign --typed-data '{"domain":{...},"types":{...},"message":{...}}'` },
  ],
  formatText: TextFormatters.typedDataSign,
};

export const typedDataSignBinding = (service: TypedDataService): FamilyBinding => ({
  run: async (ctx, net, input) => {
    let raw: unknown;
    try {
      raw = JSON.parse(input.typedData);
    } catch {
      throw new UsageError("invalid_value", "typed data must be JSON");
    }
    const payload = normalizeTypedData(raw);
    return service.sign(ctx, net.family, ctx.activeAccount, payload);
  },
});
