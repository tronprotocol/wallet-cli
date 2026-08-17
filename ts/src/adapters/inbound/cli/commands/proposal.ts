import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";
import type { TronProposalService } from "../../../../application/use-cases/tron/proposal-service.js";
import { ciEnum } from "../arity/index.js";
import { governanceTxModeFields, governanceTxRefine } from "./shared.js";
import { TextFormatters } from "../render/index.js";

export const proposalListSpec: ChainSpec = {
  path: ["proposal", "list"],
  network: "optional",
  wallet: "none",
  auth: "none",
  capability: "proposal.read",
  summary: "List on-chain governance proposals",
  description:
    "List governance proposals. Each proposal is a set of chain parameters with the values\n" +
    "it would set, for super representatives to vote on. Parameters are shown by name; the\n" +
    "value column is what the proposal sets, not the current value on chain — see\n" +
    "'chain params' for those. Active proposals are shown by default.",
  baseFields: z.object({
    state: ciEnum(["active", "all"])
      .default("active")
      .describe("active voting proposals, or all proposal history"),
    limit: z.coerce.number().int().positive().optional().describe("maximum proposals to return"),
    offset: z.coerce.number().int().min(0).default(0).describe("pagination offset"),
  }),
  examples: [
    { cmd: "wallet-cli proposal list" },
    { cmd: "wallet-cli proposal list --state all --limit 50" },
  ],
  formatText: TextFormatters.proposalList,
};

export const proposalListTronBinding = (service: TronProposalService): FamilyBinding => ({
  run: async (_ctx, net, input) => service.list(net, input),
});

export const proposalShowSpec: ChainSpec = {
  path: ["proposal", "show"],
  network: "optional",
  wallet: "none",
  auth: "none",
  capability: "proposal.read",
  positionals: [{ field: "id" }],
  summary: "Show one governance proposal",
  description:
    "Show a single proposal in full: each parameter it sets (name, value, unit), approval\n" +
    "progress, proposer, and voting-window timestamps. The addresses that approved are in\n" +
    "the json output only.\n" +
    "\n" +
    "The value shown is the one the proposal sets, not the current value on chain — a\n" +
    "proposal does not record what the parameter was. Use 'chain params' for the values in\n" +
    "effect now.",
  baseFields: z.object({
    id: z.coerce.number().int().positive().describe("proposal id"),
  }),
  examples: [{ cmd: "wallet-cli proposal show 47" }],
  formatText: TextFormatters.proposalShow,
};

export const proposalShowTronBinding = (service: TronProposalService): FamilyBinding => ({
  run: async (_ctx, net, input) => service.show(net, input.id),
});

const proposalWriteBase = {
  network: "optional" as const,
  wallet: "optional" as const,
  auth: "required" as const,
  broadcasts: true,
  capability: "proposal.write",
  baseRefine: governanceTxRefine,
  formatText: TextFormatters.governanceReceipt,
};

export const proposalCreateSpec: ChainSpec = {
  path: ["proposal", "create"],
  ...proposalWriteBase,
  summary: "Create a chain-parameter proposal",
  description:
    "Create a proposal containing one or more chain-parameter changes. Only registered\n" +
    "witnesses can create proposals; --set accepts the chain-parameter name or numeric id.",
  requires: ["a registered witness account"],
  baseFields: z.object({
    set: z
      .array(z.string().min(3))
      .min(1)
      .describe("<name|id>=<value>; repeatable; duplicate ids use the last value"),
    ...governanceTxModeFields,
  }),
  examples: [
    { cmd: "wallet-cli proposal create --set getTransactionFee=15 --wait" },
    {
      cmd: "wallet-cli proposal create --set getTransactionFee=15 --set getCreateAccountFee=200000 --wait",
    },
  ],
};

export const proposalCreateTronBinding = (service: TronProposalService): FamilyBinding => ({
  run: async (ctx, net, input) => service.create(ctx, net, input),
});

export const proposalApproveSpec: ChainSpec = {
  path: ["proposal", "approve"],
  ...proposalWriteBase,
  positionals: [{ field: "id" }],
  summary: "Approve or un-approve a proposal",
  description:
    "Approve a proposal; --cancel removes your approval. TRON has approval/un-approval only,\n" +
    "not an against vote. Only registered witnesses can submit this transaction.",
  requires: ["a registered witness account"],
  baseFields: z.object({
    id: z.coerce.number().int().positive().describe("proposal id"),
    cancel: z.boolean().default(false).describe("remove this witness's existing approval"),
    ...governanceTxModeFields,
  }),
  examples: [
    { cmd: "wallet-cli proposal approve 47" },
    { cmd: "wallet-cli proposal approve 47 --cancel" },
  ],
};

export const proposalApproveTronBinding = (service: TronProposalService): FamilyBinding => ({
  run: async (ctx, net, input) => service.approve(ctx, net, input),
});

export const proposalDeleteSpec: ChainSpec = {
  path: ["proposal", "delete"],
  ...proposalWriteBase,
  positionals: [{ field: "id" }],
  summary: "Delete a proposal during its voting window",
  description: "Delete a proposal that you created while it is still in its voting window.",
  requires: ["the proposal creator account"],
  baseFields: z.object({
    id: z.coerce.number().int().positive().describe("proposal id"),
    ...governanceTxModeFields,
  }),
  examples: [{ cmd: "wallet-cli proposal delete 48" }],
};

export const proposalDeleteTronBinding = (service: TronProposalService): FamilyBinding => ({
  run: async (ctx, net, input) => service.delete(ctx, net, input),
});
