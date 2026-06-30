import { z } from "zod";
import type { NetworkDescriptor } from "../../../../../domain/types/index.js";
import type {
  CommandDefinition,
  ExecutionContext,
} from "../../contracts/index.js";
import type { TronStakeService } from "../../../../../application/use-cases/tron/stake-service.js";
import { RESOURCES } from "../../../../../domain/resources/index.js";
import { Schemas } from "../../schemas/index.js";
import { ciEnum } from "../../arity/index.js";
import { txModeFields } from "../shared.js";
import { TextFormatters } from "../../render/index.js";

const resourceField = (description: string) =>
  ciEnum(RESOURCES).default("bandwidth").describe(description);

interface StakeCommandOptions {
  capability?: string;
  refine?: (value: any, context: z.RefinementCtx) => void;
}

type StakeExecutor = (
  context: ExecutionContext,
  network: NetworkDescriptor,
  input: any,
) => Promise<unknown>;

function command(
  action: string,
  summary: string,
  execute: StakeExecutor,
  extra: z.ZodRawShape = {},
  options: StakeCommandOptions = {},
): CommandDefinition {
  const fields = z.object({ ...extra, ...txModeFields });
  return {
    path: ["stake", action], family: "tron",
    network: "required", wallet: "optional", auth: "required",
    broadcasts: true,
    capability: options.capability ?? "staking.freeze",
    summary,
    fields,
    input: options.refine ? fields.superRefine(options.refine) : fields,
    examples: [{ cmd: `wallet-cli stake ${action} --network tron:nile` }],
    formatText: TextFormatters.txReceipt,
    run: async (context, network, input) => execute(context, network!, input),
  };
}

export function stakeCommands(service: TronStakeService): CommandDefinition[] {
  return [
    command(
      "freeze",
      "Stake TRX for energy/bandwidth (FreezeBalanceV2)",
      (context, network, input) => service.freeze(context, network, input),
      {
        amountSun: Schemas.uintString().describe("amount to freeze as staked TRX, in SUN"),
        resource: resourceField("resource type to obtain"),
      },
    ),
    command(
      "unfreeze",
      "Unstake TRX (UnfreezeBalanceV2)",
      (context, network, input) => service.unfreeze(context, network, input),
      {
        amountSun: Schemas.uintString().describe("amount to unfreeze as staked TRX, in SUN"),
        resource: resourceField("resource type to release"),
      },
    ),
    command(
      "withdraw",
      "Withdraw expired unfrozen TRX (WithdrawExpireUnfreeze)",
      (context, network, input) => service.withdraw(context, network, input),
    ),
    command(
      "cancel-unfreeze",
      "Cancel all pending unstakes (roll back to frozen)",
      (context, network, input) => service.cancelUnfreeze(context, network, input),
    ),
    command(
      "delegate",
      "Delegate resource to another address (DelegateResourceV2)",
      (context, network, input) => service.delegate(context, network, input),
      {
        amountSun: Schemas.uintString()
          .describe("staked-TRX amount backing the delegated resource, in SUN"),
        receiver: Schemas.addressFor("tron")
          .describe("TRON address receiving the delegated resource"),
        resource: resourceField("resource type to delegate or reclaim"),
        lock: z.boolean().default(false)
          .describe("lock the delegation and prevent early undelegation"),
        lockPeriod: z.coerce.number().int().positive().optional()
          .describe("lock duration in blocks, approximately 3 seconds per block; requires --lock"),
      },
      {
        capability: "staking.delegate",
        refine: (value, context) => {
          if (value.lockPeriod !== undefined && !value.lock) {
            context.addIssue({
              code: "custom",
              message: "--lock-period requires --lock",
              path: ["lockPeriod"],
            });
          }
        },
      },
    ),
    command(
      "undelegate",
      "Reclaim delegated resource (UnDelegateResourceV2)",
      (context, network, input) => service.undelegate(context, network, input),
      {
        amountSun: Schemas.uintString()
          .describe("staked-TRX amount backing the resource to reclaim, in SUN"),
        receiver: Schemas.addressFor("tron")
          .describe("TRON address that previously received the delegated resource"),
        resource: resourceField("resource type to delegate or reclaim"),
      },
      { capability: "staking.delegate" },
    ),
  ];
}
