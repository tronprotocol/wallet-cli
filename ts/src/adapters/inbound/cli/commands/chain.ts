import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";
import type { TronChainService } from "../../../../application/use-cases/tron/chain-service.js";
import type { EvmChainService } from "../../../../application/use-cases/evm/chain-service.js";
import { TextFormatters } from "../render/index.js";

/** `chain node` is its own export, not part of the TRON bundle below: every family can report
 *  node status, so the spec is shared and each family brings its own binding. */
/** `chain prices` is shared: every family prices transactions somehow, though the fields differ. */
export const chainPricesSpec: ChainSpec = {
  path: ["chain", "prices"],
  network: "optional",
  wallet: "none",
  auth: "none",
  summary: "Current transaction unit prices",
  description:
    "Show what a transaction costs to send on this network. The fields are family-shaped:\n" +
    "TRON reports energy/bandwidth unit prices (in SUN; 1 TRX = 1,000,000 SUN) and the memo\n" +
    "fee. An EVM chain reports its fee model plus base/priority/gas price (in wei).",
  baseFields: z.object({}),
  examples: [
    { cmd: "wallet-cli chain prices --network nile" },
    { cmd: "wallet-cli chain prices --network sepolia" },
  ],
  formatText: TextFormatters.chainPrices,
};

export const chainPricesTronBinding = (service: TronChainService): FamilyBinding => ({
  run: async (_ctx, net) => service.prices(net),
});

export const chainPricesEvmBinding = (service: EvmChainService): FamilyBinding => ({
  run: async (_ctx, net) => service.prices(net),
});

export const chainNodeSpec: ChainSpec = {
  path: ["chain", "node"],
  network: "optional",
  wallet: "none",
  auth: "none",
  summary: "Connected node status",
  description:
    "Show the connected node's status: version, head/solid block height, sync state,\n" +
    'and peer connections. Useful to tell "node out of sync" from "problem with my\n' +
    'transaction". Fields the endpoint does not expose are shown as "—" (null in json).',
  baseFields: z.object({}),
  examples: [
    { cmd: "wallet-cli chain node --network nile" },
    { cmd: "wallet-cli chain node --network sepolia" },
  ],
  formatText: TextFormatters.chainNode,
};

export const chainNodeTronBinding = (service: TronChainService): FamilyBinding => ({
  run: async (_ctx, net) => service.node(net),
});

export const chainNodeEvmBinding = (service: EvmChainService): FamilyBinding => ({
  run: async (_ctx, net) => service.node(net),
});

export function chainDefinitions(
  service: TronChainService,
): Array<{ spec: ChainSpec; binding: FamilyBinding }> {
  return [
    {
      spec: {
        path: ["chain", "params"],
        network: "optional",
        wallet: "none",
        auth: "none",
        summary: "On-chain governance parameters",
        description: "Show on-chain governance parameters. Use --key for one value.",
        baseFields: z.object({
          key: z
            .string()
            .optional()
            .describe("return only this parameter (e.g. getEnergyFee); omit to list all"),
        }),
        examples: [
          { cmd: "wallet-cli chain params" },
          { cmd: "wallet-cli chain params --key getEnergyFee" },
        ],
        formatText: TextFormatters.chainParams,
      },
      binding: { run: async (_ctx, net, input) => service.params(net, input.key) },
    },
  ];
}
