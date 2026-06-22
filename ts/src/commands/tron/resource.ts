/**
 * TRON resource group (L4) — Stake 2.0 freeze/unfreeze/withdraw/cancel + unit prices.
 */
import { z } from "zod";
import type { CommandDefinition } from "../../core/types/index.js";
import { Schemas } from "../../infra/contract/index.js";
import { TronRpcClient } from "../../infra/rpc/index.js";
import type { Services } from "../services.js";
import { txModeFields, txMode, outcomeData } from "../shared.js";
import { UsageError } from "../../core/errors/index.js";
import { rpcOf } from "./shared.js";

const resourceEnum = z.enum(["energy", "bandwidth"]).default("bandwidth").describe("resource type");
const toResourceCode = (r: string) => (r === "energy" ? "ENERGY" : "BANDWIDTH");

interface StakeOpts {
  capability?: string;
  refine?: (val: any, ctx: z.RefinementCtx) => void;
}

function stakeCmd(
  services: Services,
  id: string, action: string, summary: string,
  build: (rpc: TronRpcClient, owner: string, input: any) => Promise<unknown>,
  extra: z.ZodRawShape = {},
  opts: StakeOpts = {},
): CommandDefinition {
  const fields = z.object({ ...extra, ...txModeFields });
  return {
    id, path: ["resource", action], family: "tron",
    network: "required", wallet: "optional", auth: "required", capability: opts.capability ?? "staking.freeze",
    summary, fields, input: opts.refine ? fields.superRefine(opts.refine) : fields,
    examples: [{ cmd: `wallet-cli tron resource ${action} --network nile` }],
    run: async (ctx, net, input) => {
      const mode = txMode(input);
      const rpc = rpcOf(net!);
      const outcome = await services.txPipeline.run({
        ctx, net: net!, account: ctx.activeAccount, ...mode,
        build: (owner) => build(rpc, owner, input),
        estimate: async () => ({ feeModel: "tron-resource", note: "staking ops cost bandwidth" }),
      });
      return outcomeData(outcome);
    },
  };
}

function prices(): CommandDefinition {
  const fields = z.object({});
  return {
    id: "tron.resource.prices", path: ["resource", "prices"], family: "tron",
    network: "optional", wallet: "none", auth: "none", capability: "resources.energy",
    summary: "energy / bandwidth unit prices", fields, input: fields,
    examples: [{ cmd: "wallet-cli tron resource prices --network nile" }],
    run: async (_ctx, net) => {
      const rpc = rpcOf(net!);
      const [energy, bandwidth] = await Promise.all([rpc.getEnergyPrices(), rpc.getBandwidthPrices()]);
      return { energyPrices: energy, bandwidthPrices: bandwidth };
    },
  };
}

export function resourceCommands(services: Services): CommandDefinition[] {
  return [
    stakeCmd(
      services, "tron.resource.freeze", "freeze", "stake TRX for energy/bandwidth (FreezeBalanceV2)",
      (rpc, owner, i) => rpc.buildFreezeV2(owner, i.amountSun, i.resource === "energy" ? "ENERGY" : "BANDWIDTH"),
      {
        amountSun: Schemas.uintString().describe("amount to freeze (SUN)"),
        resource: z.enum(["energy", "bandwidth"]).default("bandwidth").describe("resource type"),
      },
    ),
    stakeCmd(
      services, "tron.resource.unfreeze", "unfreeze", "unstake TRX (UnfreezeBalanceV2)",
      (rpc, owner, i) => rpc.buildUnfreezeV2(owner, i.amountSun, i.resource === "energy" ? "ENERGY" : "BANDWIDTH"),
      {
        amountSun: Schemas.uintString().describe("amount to unfreeze (SUN)"),
        resource: z.enum(["energy", "bandwidth"]).default("bandwidth").describe("resource type"),
      },
    ),
    stakeCmd(
      services, "tron.resource.withdraw", "withdraw", "withdraw expired unfrozen TRX",
      (rpc, owner) => rpc.buildWithdrawExpireUnfreeze(owner),
    ),
    stakeCmd(
      services, "tron.resource.cancel-unfreeze", "cancel-unfreeze", "cancel all pending unstakes (roll back to frozen)",
      (rpc, owner) => rpc.buildCancelAllUnfreezeV2(owner),
    ),
    stakeCmd(
      services, "tron.resource.delegate", "delegate", "delegate frozen resource to another address (DelegateResourceV2)",
      (rpc, owner, i) => {
        if (i.receiver === owner) throw new UsageError("invalid_value", "--receiver must differ from the owner address");
        return rpc.buildDelegateResource(owner, i.amountSun, toResourceCode(i.resource), i.receiver, i.lock, i.lockPeriod);
      },
      {
        amountSun: Schemas.uintString().describe("staked-TRX worth of resource to delegate (SUN)"),
        receiver: Schemas.base58Address().describe("address to delegate the resource to"),
        resource: resourceEnum,
        lock: z.boolean().default(false).describe("lock the delegation (blocks early undelegate)"),
        lockPeriod: z.coerce.number().int().positive().optional().describe("lock duration in blocks (3s each); requires --lock"),
      },
      {
        capability: "staking.delegate",
        refine: (val, ctx) => {
          if (val.lockPeriod !== undefined && !val.lock) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "--lock-period requires --lock", path: ["lockPeriod"] });
          }
        },
      },
    ),
    stakeCmd(
      services, "tron.resource.undelegate", "undelegate", "reclaim delegated resource (UnDelegateResourceV2)",
      (rpc, owner, i) => {
        if (i.receiver === owner) throw new UsageError("invalid_value", "--receiver must differ from the owner address");
        return rpc.buildUndelegateResource(owner, i.amountSun, toResourceCode(i.resource), i.receiver);
      },
      {
        amountSun: Schemas.uintString().describe("staked-TRX worth of resource to reclaim (SUN)"),
        receiver: Schemas.base58Address().describe("address the resource was delegated to"),
        resource: resourceEnum,
      },
      { capability: "staking.delegate" },
    ),
    prices(),
  ];
}
