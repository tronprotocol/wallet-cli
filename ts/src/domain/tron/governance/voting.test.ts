import { describe, expect, it } from "vitest";
import {
  ELECTED_SR_COUNT,
  MAINTENANCE_INTERVAL_MS,
  MAX_REWARDED_RANK,
  MAX_VOTE_ITEMS,
  proposalApprovalThreshold,
  REWARD_WITHDRAW_INTERVAL_MS,
  rewardWithdrawStatus,
} from "./voting.js";

const DAY_MS = 86_400_000;

describe("voting limits", () => {
  it("states the protocol's vote and rank limits", () => {
    expect(ELECTED_SR_COUNT).toBe(27);
    expect(MAX_REWARDED_RANK).toBe(127);
    expect(MAX_VOTE_ITEMS).toBe(30);
    expect(MAINTENANCE_INTERVAL_MS).toBe(DAY_MS / 4);
    expect(REWARD_WITHDRAW_INTERVAL_MS).toBe(DAY_MS);
  });
});

describe("rewardWithdrawStatus", () => {
  it("is withdrawable when the account never withdrew", () => {
    expect(rewardWithdrawStatus(undefined, 0)).toEqual({
      withdrawableNow: true,
      withdrawableAt: null,
    });
  });

  it("opens exactly one day after the last withdrawal", () => {
    expect(rewardWithdrawStatus(1_000, 1_000 + DAY_MS - 1)).toEqual({
      withdrawableNow: false,
      withdrawableAt: 1_000 + DAY_MS,
    });
    expect(rewardWithdrawStatus(1_000, 1_000 + DAY_MS)).toEqual({
      withdrawableNow: true,
      withdrawableAt: null,
    });
  });
});

describe("proposalApprovalThreshold", () => {
  it.each([
    [27, 18],
    [10, 7],
    [1, 1],
    [0, 18],
  ])("with %i active witnesses needs %i approvals", (active, needed) => {
    expect(proposalApprovalThreshold(active)).toBe(needed);
  });
});
