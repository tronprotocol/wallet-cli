/**
 * EvmModule (L4) — EVM's own command surface. EVM-specific build/estimate (viem prepare,
 * EIP-1559 fee) live here; only infra is shared. Implements the ChainModule contract
 * (plan §3 L4 / §5). EVM-only commands (typed-data sign, deploy, legacy gas…) will be added here.
 */
import { z } from "zod";
import type {
  CapabilityDescriptor,
  ChainModule,
  CommandDefinition,
  CommandRegistryLike,
  NetworkDescriptor,
} from "../types/index.js";
import { Schemas } from "../contract/index.js";
import { BUILTIN_NETWORKS } from "../config/builtins.js";
import { EvmRpcClient } from "../rpc/index.js";
import type { Services } from "./services.js";
import { balanceCommand, messageSignCommand } from "./shared.js";

export class EvmModule implements ChainModule {
  readonly family = "evm" as const;
  constructor(private readonly services: Services) {}

  networks(): NetworkDescriptor[] {
    return Object.values(BUILTIN_NETWORKS).filter((n) => n.family === "evm");
  }

  capabilities(): CapabilityDescriptor[] {
    return [
      { key: "account.balance.native", summary: "native ETH/wei balance" },
      { key: "tx.native.transfer", summary: "transfer native coin (wei)" },
      { key: "message.sign", summary: "personal_sign a message" },
      { key: "fee.eip1559", summary: "EIP-1559 fee market (where supported)" },
    ];
  }

  registerCommands(reg: CommandRegistryLike): void {
    reg.add(balanceCommand("evm"));
    reg.add(this.#sendNative());
    reg.add(messageSignCommand("evm", this.services));
  }

  // ── EVM-specific: native wei transfer through the shared TxPipeline ──
  #sendNative(): CommandDefinition {
    const services = this.services;
    const fields = z.object({
      to: Schemas.evmAddress().describe("recipient EVM address"),
      amountWei: Schemas.uintString().describe("amount in wei"),
      dryRun: z.boolean().default(false).describe("build + estimate only, do not sign"),
      broadcast: z.boolean().default(false).describe("broadcast after signing"),
    });
    return {
      id: "evm.tx.send-native",
      path: ["tx", "send-native"],
      family: "evm",
      network: "required",
      wallet: "required",
      auth: "required",
      capability: "tx.native.transfer",
      summary: "transfer native wei",
      fields,
      input: fields,
      examples: [{ cmd: "wallet-cli evm tx send-native --network base --to 0x... --amount-wei 1000000 --dry-run" }],
      run: async (ctx, net, input) =>
        services.txPipeline.run({
          ctx,
          net: net!,
          account: ctx.activeAccount,
          dryRun: input.dryRun,
          broadcast: input.broadcast,
          build: (from) => (net!.rpc as EvmRpcClient).prepareNativeTransfer(from, input.to, input.amountWei),
          estimate: async (tx: any) => {
            const gas = BigInt(tx.gas ?? 21000n);
            const price = BigInt(tx.maxFeePerGas ?? tx.gasPrice ?? 0n);
            return { feeWei: (gas * price).toString(), gas: gas.toString(), feeModel: net!.feeModel };
          },
        }),
    };
  }
}
