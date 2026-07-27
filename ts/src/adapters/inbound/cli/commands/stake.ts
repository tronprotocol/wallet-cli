import { z } from "zod";
import type { NetworkDescriptor } from "../../../../domain/types/index.js";
import type {
  ChainSpec,
  ExecutionContext,
  FamilyBinding,
} from "../contracts/index.js";
import type { TronStakeService } from "../../../../application/use-cases/tron/stake-service.js";
import { RESOURCES } from "../../../../domain/resources/index.js";
import { Schemas } from "../schemas/index.js";
import { ciEnum } from "../arity/index.js";
import { txModeFields } from "./shared.js";
import { TextFormatters } from "../render/index.js";

const resourceField = (description: string) =>
  ciEnum(RESOURCES).default("bandwidth").describe(description);

interface StakeCommandOptions {
  capability?: string;
  refine?: (value: any, context: z.RefinementCtx) => void;
  requires?: string[];
}

type StakeExecutor = (
  context: ExecutionContext,
  network: NetworkDescriptor,
  input: any,
) => Promise<unknown>;

function stakeCommand(
  action: string,
  summary: string,
  execute: StakeExecutor,
  extra: z.ZodRawShape = {},
  options: StakeCommandOptions = {},
): { spec: ChainSpec; binding: FamilyBinding } {
  const fields = z.object({ ...extra, ...txModeFields });
  return {
    spec: {
      path: ["stake", action],
      network: "optional", wallet: "optional", auth: "required",
      broadcasts: true,
      capability: options.capability ?? "staking.freeze",
      summary,
      requires: options.requires,
      baseFields: fields,
      baseRefine: options.refine,
      examples: [{ cmd: `wallet-cli stake ${action}` }],
      formatText: TextFormatters.txReceipt,
    },
    binding: { run: async (ctx, net, input) => execute(ctx, net, input) },
  };
}

export function stakeDefinitions(service: TronStakeService): Array<{ spec: ChainSpec; binding: FamilyBinding }> {
  return [
    stakeCommand(
      "freeze",
      "Stake TRX for energy/bandwidth (FreezeBalanceV2)",
      (context, network, input) => service.freeze(context, network, input),
      {
        amountSun: Schemas.positiveIntString().describe("amount to freeze as staked TRX, in SUN"),
        resource: resourceField("resource type to obtain"),
      },
    ),
    stakeCommand(
      "unfreeze",
      "Unstake TRX (UnfreezeBalanceV2)",
      (context, network, input) => service.unfreeze(context, network, input),
      {
        amountSun: Schemas.positiveIntString().describe("amount to unfreeze as staked TRX, in SUN"),
        resource: resourceField("resource type to release"),
      },
    ),
    stakeCommand(
      "withdraw",
      "Withdraw expired unfrozen TRX (WithdrawExpireUnfreeze)",
      (context, network, input) => service.withdraw(context, network, input),
    ),
    stakeCommand(
      "cancel-unfreeze",
      "Cancel all pending unstakes (roll back to frozen)",
      (context, network, input) => service.cancelUnfreeze(context, network, input),
      {},
      {
        // The Ledger TRON app firmware rejects CancelAllUnfreezeV2Contract (APDU 0x6a80),
        // even with blind-signing enabled; software accounts sign it fine.
        requires: ["a software (non-Ledger) account — the Ledger TRON app cannot sign this transaction type"],
      },
    ),
    stakeCommand(
      "delegate",
      "Delegate resource to another address (DelegateResourceV2)",
      (context, network, input) => service.delegate(context, network, input),
      {
        amountSun: Schemas.positiveIntString()
          .describe("staked-TRX amount backing the delegated resource, in SUN"),
        receiver: Schemas.addressFor("tron")
          .describe("TRON address receiving the delegated resource"),
        resource: resourceField("resource type to delegate or reclaim"),
        lock: z.boolean().default(false)
          .describe("lock the delegation and prevent early undelegation"),
        lockPeriod: Schemas.positiveIntString().optional()
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
    stakeCommand(
      "undelegate",
      "Reclaim delegated resource (UnDelegateResourceV2)",
      (context, network, input) => service.undelegate(context, network, input),
      {
        amountSun: Schemas.positiveIntString()
          .describe("staked-TRX amount backing the resource to reclaim, in SUN"),
        receiver: Schemas.addressFor("tron")
          .describe("TRON address that previously received the delegated resource"),
        resource: resourceField("resource type to delegate or reclaim"),
      },
      { capability: "staking.delegate" },
    ),
    {
      spec: {
        path: ["stake", "info"],
        network: "optional", wallet: "optional", auth: "none",
        summary: "Staking & resource overview (staked / voting power / resource / unfreezing / withdrawable)",
        description:
          "Staking & resource overview: staked amounts, voting power (TP), energy/bandwidth\n" +
          "usage, pending unstakes, currently withdrawable TRX, and available unfreeze slots.",
        baseFields: z.object({}),
        examples: [{ cmd: "wallet-cli stake info" }, { cmd: "wallet-cli stake info --account main -o json" }],
        formatText: TextFormatters.stakeInfo,
      },
      binding: { run: async (ctx, net) => service.info(ctx, net) },
    },
    {
      spec: {
        path: ["stake", "delegated"],
        network: "optional", wallet: "optional", auth: "none",
        summary: "Delegation details and max delegatable size",
        description:
          "Delegation details (outbound/inbound) plus the maximum size you can still delegate.\n" +
          "Outbound shows \"Locked until\" (you cannot reclaim before then); inbound shows\n" +
          "\"Guaranteed until\" (the delegator cannot reclaim before then).",
        baseFields: z.object({
          direction: ciEnum(["out", "in"]).default("out")
            .describe("out = delegated to others; in = delegated to me"),
          resource: ciEnum(RESOURCES).optional()
            .describe("filter to a single resource type; omit to show both"),
          to: Schemas.addressFor("tron").optional()
            .describe("only show delegation to this receiver (out only)"),
        }),
        baseRefine: (value, context) => {
          if (value.to !== undefined && value.direction === "in") {
            context.addIssue({ code: "custom", path: ["to"], message: "--to only applies to --direction out" });
          }
        },
        examples: [
          { cmd: "wallet-cli stake delegated" },
          { cmd: "wallet-cli stake delegated --direction in" },
          { cmd: "wallet-cli stake delegated --to TBy..." },
        ],
        formatText: TextFormatters.stakeDelegated,
      },
      binding: { run: async (ctx, net, input) => service.delegated(ctx, net, input) },
    },
  ];
}
