import type { TronGateway, TronResourceUsage } from "../../ports/chain/tron-gateway.js";

// In TP: 1 TP per staked TRX.
export interface VotingPowerView {
  total: number;
  used: number;
  available: number;
}

export async function readVotingPower(
  gateway: TronGateway,
  address: string,
): Promise<VotingPowerView> {
  return votingPowerView(await gateway.getAccountResources(address));
}

export function votingPowerView({ votingPower }: TronResourceUsage): VotingPowerView {
  return { ...votingPower, available: votingPower.total - votingPower.used };
}
