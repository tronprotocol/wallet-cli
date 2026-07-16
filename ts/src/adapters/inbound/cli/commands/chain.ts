import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";
import type { TronChainService } from "../../../../application/use-cases/tron/chain-service.js";
import { TextFormatters } from "../render/index.js";

export function chainDefinitions(service: TronChainService): Array<{ spec: ChainSpec; binding: FamilyBinding }> {
  return [
    {
      spec: {
        path: ["chain", "params"],
        network: "optional", wallet: "none", auth: "none",
        summary: "On-chain governance parameters",
        description: "Show on-chain governance parameters. Use --key for one value.",
        baseFields: z.object({
          key: z.string().optional().describe("return only this parameter (e.g. getEnergyFee); omit to list all"),
        }),
        examples: [{ cmd: "wallet-cli chain params" }, { cmd: "wallet-cli chain params --key getEnergyFee" }],
        formatText: TextFormatters.chainParams,
      },
      binding: { run: async (_ctx, net, input) => service.params(net, input.key) },
    },
    {
      spec: {
        path: ["chain", "prices"],
        network: "optional", wallet: "none", auth: "none",
        summary: "Energy/bandwidth unit price and memo fee",
        description:
          "Show current energy/bandwidth unit price (in SUN; 1 TRX = 1,000,000 SUN)\n" +
          "and the memo fee.",
        baseFields: z.object({}),
        examples: [{ cmd: "wallet-cli chain prices" }],
        formatText: TextFormatters.chainPrices,
      },
      binding: { run: async (_ctx, net) => service.prices(net) },
    },
    {
      spec: {
        path: ["chain", "node"],
        network: "optional", wallet: "none", auth: "none",
        summary: "Connected node status (version / sync / peers)",
        description:
          "Show the connected node's status: version, head/solid block height, sync state,\n" +
          "and peer connections. Useful to tell \"node out of sync\" from \"problem with my\n" +
          "transaction\". Fields the endpoint does not expose are shown as \"—\" (null in json).",
        baseFields: z.object({}),
        examples: [{ cmd: "wallet-cli chain node" }],
        formatText: TextFormatters.chainNode,
      },
      binding: { run: async (_ctx, net) => service.node(net) },
    },
  ];
}
