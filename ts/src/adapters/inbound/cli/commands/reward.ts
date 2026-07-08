import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";
import type { TronRewardService } from "../../../../application/use-cases/tron/reward-service.js";
import { txModeFields } from "./shared.js";
import { TextFormatters } from "../render/index.js";

export const rewardBalanceSpec: ChainSpec = {
  path: ["reward", "balance"],
  network: "optional", wallet: "optional", auth: "none",
  capability: "reward.balance",
  summary: "Show claimable voting/block reward and withdraw status",
  baseFields: z.object({}),
  examples: [{ cmd: "wallet-cli reward balance" }],
  formatText: TextFormatters.rewardBalance,
};

export const rewardBalanceTronBinding = (svc: TronRewardService): FamilyBinding => ({
  run: async (ctx, net) => svc.balance(ctx, net),
});

export const rewardWithdrawSpec: ChainSpec = {
  path: ["reward", "withdraw"],
  network: "optional", wallet: "optional", auth: "required",
  broadcasts: true,
  capability: "reward.withdraw",
  summary: "Withdraw accrued voting/block rewards",
  baseFields: z.object({ ...txModeFields }),
  examples: [
    { cmd: "wallet-cli reward withdraw" },
    { cmd: "wallet-cli reward withdraw --wait" },
  ],
  formatText: TextFormatters.txReceipt,
};

export const rewardWithdrawTronBinding = (svc: TronRewardService): FamilyBinding => ({
  run: async (ctx, net, input) => svc.withdraw(ctx, net, input),
});
