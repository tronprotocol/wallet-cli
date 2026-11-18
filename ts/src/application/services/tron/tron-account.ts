import { requestDispatchCheck } from "../command-deadline.js";
import type { ExecutionDeadline } from "../../contracts/deadline.js";
import type { AccountScope } from "../../contracts/execution-scope.js";
import type { DispatchCheck } from "../../contracts/deadline.js";
import type { TronAccount, TronGateway } from "../../ports/chain/tron/tron-gateway.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { ChainError, errorMessage, UsageError } from "../../../domain/errors/index.js";

/** TRON-only commands cannot resolve a family mismatch by switching to an EVM network. */
export function resolveTronAccount(scope: AccountScope): string {
  try {
    return scope.resolveAddress("tron");
  } catch (error) {
    if (error instanceof UsageError && error.code === "family_mismatch")
      throw new UsageError(
        "family_mismatch",
        errorMessage`this command supports TRON only; select an account with a TRON address using --account, or switch the active account`,
      );
    throw error;
  }
}

// Any gateway source that can read a TRON account, including the one a plugin receives.
export interface TronAccountReader {
  get(
    network: NetworkDescriptor,
    family: "tron",
    check: DispatchCheck,
  ): Pick<TronGateway, "getAccount">;
}

// Nodes return an empty record for an inactive account.
export async function activeTronAccount(
  deadline: ExecutionDeadline,
  gateways: TronAccountReader,
  network: NetworkDescriptor,
  owner: string,
): Promise<TronAccount> {
  const account = await gateways
    .get(network, "tron", requestDispatchCheck(deadline))
    .getAccount(owner);
  if (!account.address) {
    throw new ChainError(
      "account_not_active",
      `${owner} is not activated on ${network.id}; it must receive TRX before it can send a transaction`,
    );
  }
  return account;
}
