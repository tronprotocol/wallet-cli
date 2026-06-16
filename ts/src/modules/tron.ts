/**
 * TronModule (L4) — TRON's own command surface. No universal provider: TRON-specific build/
 * estimate/codecs live here; only infra (TxPipeline, SignerResolver, RpcClient) is shared.
 * Implements the ChainModule contract (plan §3 L4 / §5). This milestone ships 3 symbolic
 * commands; TRON-only commands (freeze, vote, TRC10…) will be added here.
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
import { TronRpcClient } from "../rpc/index.js";
import type { Services } from "./services.js";
import { balanceCommand, messageSignCommand } from "./shared.js";

export class TronModule implements ChainModule {
  readonly family = "tron" as const;
  constructor(private readonly services: Services) {}

  networks(): NetworkDescriptor[] {
    return Object.values(BUILTIN_NETWORKS).filter((n) => n.family === "tron");
  }

  capabilities(): CapabilityDescriptor[] {
    return [
      { key: "account.balance.native", summary: "native TRX/SUN balance" },
      { key: "tx.native.transfer", summary: "transfer TRX (SUN)" },
      { key: "message.sign", summary: "sign a message (TIP-191/V2)" },
    ];
  }

  registerCommands(reg: CommandRegistryLike): void {
    reg.add(balanceCommand("tron"));
    reg.add(this.#sendNative());
    reg.add(messageSignCommand("tron", this.services));
  }

  // ── TRON-specific: native SUN transfer through the shared TxPipeline ──
  #sendNative(): CommandDefinition {
    const services = this.services;
    const fields = z.object({
      to: Schemas.base58Address().describe("recipient TRON address"),
      amountSun: Schemas.uintString().describe("amount in SUN"),
      dryRun: z.boolean().default(false).describe("build + estimate only, do not sign"),
      broadcast: z.boolean().default(false).describe("broadcast after signing"),
    });
    return {
      id: "tron.tx.send-native",
      path: ["tx", "send-native"],
      family: "tron",
      network: "required",
      wallet: "required",
      auth: "required",
      capability: "tx.native.transfer",
      summary: "transfer native SUN",
      fields,
      input: fields,
      examples: [{ cmd: "wallet-cli tron tx send-native --network nile --to T... --amount-sun 1000000 --dry-run" }],
      run: async (ctx, net, input) =>
        services.txPipeline.run({
          ctx,
          net: net!,
          account: ctx.activeAccount,
          dryRun: input.dryRun,
          broadcast: input.broadcast,
          build: (from) => (net!.rpc as TronRpcClient).buildNativeTransfer(from, input.to, input.amountSun),
          estimate: async () => ({ feeModel: "tron-resource", note: "bandwidth/energy estimate omitted (symbolic build)" }),
        }),
    };
  }
}
