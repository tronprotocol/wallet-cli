import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";
import type { TronVoteService } from "../../../../application/use-cases/tron/vote-service.js";
import { txModeFields } from "./shared.js";
import { TextFormatters } from "../render/index.js";

// repeatable flag: the arity layer sets yargs `array: true`, so `--for` always arrives as a
// string[] (single or repeated) — no preprocess needed to normalize.
const voteForField = z.array(z.string().min(1)).min(1).max(30)
  .describe("witness address = vote count (positive integer); repeatable; the set replaces all prior votes (at least 1, at most 30 entries)");

export const voteCastSpec: ChainSpec = {
  path: ["vote", "cast"],
  network: "optional", wallet: "optional", auth: "required",
  broadcasts: true,
  capability: "vote.cast",
  summary: "Cast or replace your full SR vote allocation",
  description:
    "Cast or replace your FULL vote allocation. The set you pass becomes\n" +
    "your complete voting distribution; any previous SR not listed is set to zero.\n" +
    "Total votes must be at least 1. 1 vote = 1 Tron Power (TP) = 1 staked TRX.",
  baseFields: z.object({
    for: voteForField,
    ...txModeFields,
  }),
  examples: [{ cmd: "wallet-cli vote cast --for TZ4...=600 --for TT5...=400" }],
  formatText: TextFormatters.txReceipt,
};

export const voteCastTronBinding = (svc: TronVoteService): FamilyBinding => ({
  run: async (ctx, net, input) => svc.cast(ctx, net, input),
});

export const voteListSpec: ChainSpec = {
  path: ["vote", "list"],
  network: "optional", wallet: "none", auth: "none",
  capability: "vote.list",
  summary: "List super representatives and candidates",
  description: "List super representatives (elected by default) with votes, APR, and reward ratio.",
  baseFields: z.object({
    limit: z.coerce.number().int().positive().max(127).default(27)
      .describe("number of ranks to return; max 127"),
    candidates: z.boolean().default(false)
      .describe("include non-elected candidates"),
  }),
  examples: [
    { cmd: "wallet-cli vote list" },
    { cmd: "wallet-cli vote list --candidates --limit 100" },
  ],
  formatText: TextFormatters.voteList,
};

export const voteListTronBinding = (svc: TronVoteService): FamilyBinding => ({
  run: async (_ctx, net, input) => svc.list(net, input),
});

export const voteStatusSpec: ChainSpec = {
  path: ["vote", "status"],
  network: "optional", wallet: "optional", auth: "none",
  capability: "vote.status",
  summary: "Show current votes, voting power, and reward overview",
  description:
    "Show your current vote distribution (with each SR's APR and reward ratio),\n" +
    "your voting power (TP), and the currently claimable reward. Warns when votes\n" +
    "sit on an SR with a 0% reward ratio (they earn nothing).",
  baseFields: z.object({}),
  examples: [{ cmd: "wallet-cli vote status" }],
  formatText: TextFormatters.voteStatus,
};

export const voteStatusTronBinding = (svc: TronVoteService): FamilyBinding => ({
  run: async (ctx, net) => svc.status(ctx, net),
});
