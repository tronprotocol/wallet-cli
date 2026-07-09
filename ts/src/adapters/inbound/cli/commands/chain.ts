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
        baseFields: z.object({}),
        examples: [{ cmd: "wallet-cli chain node" }],
        formatText: TextFormatters.chainNode,
      },
      binding: { run: async (_ctx, net) => service.node(net) },
    },
  ];
}
