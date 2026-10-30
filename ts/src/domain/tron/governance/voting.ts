// The top-ranked witnesses that produce blocks.
export const ELECTED_SR_COUNT = 27;
// Witnesses ranked up to this earn vote rewards.
export const MAX_REWARDED_RANK = 127;
// Entries one VoteWitnessContract may carry.
export const MAX_VOTE_ITEMS = 30;
// The chain parameter getMaintenanceTimeInterval on mainnet; votes are tallied when it ends.
export const MAINTENANCE_INTERVAL_MS = 6 * 60 * 60 * 1000;
// An account may withdraw its voting reward once per interval.
export const REWARD_WITHDRAW_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Approvals a proposal needs when the active witness count is unknown.
const DEFAULT_PROPOSAL_APPROVALS = 18;

export interface RewardWithdrawStatus {
  withdrawableNow: boolean;
  // Unix milliseconds; null when withdrawable now.
  withdrawableAt: number | null;
}

// Times are Unix milliseconds.
export function rewardWithdrawStatus(
  latestWithdrawAt: number | undefined,
  now: number,
): RewardWithdrawStatus {
  if (latestWithdrawAt === undefined) return { withdrawableNow: true, withdrawableAt: null };
  const at = latestWithdrawAt + REWARD_WITHDRAW_INTERVAL_MS;
  return at <= now
    ? { withdrawableNow: true, withdrawableAt: null }
    : { withdrawableNow: false, withdrawableAt: at };
}

// 70% of the active witnesses, rounded down, and at least one.
export function proposalApprovalThreshold(activeWitnessCount: number): number {
  return activeWitnessCount > 0
    ? Math.max(1, Math.floor(activeWitnessCount * 0.7))
    : DEFAULT_PROPOSAL_APPROVALS;
}
