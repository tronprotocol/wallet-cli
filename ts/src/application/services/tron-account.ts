import type { AccountScope } from "../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../ports/chain/gateway-provider.js";
import type { TronAccount } from "../ports/chain/tron-gateway.js";
import type { NetworkDescriptor } from "../../domain/types/index.js";
import { ChainError, UsageError } from "../../domain/errors/index.js";

/** TRON-only commands cannot resolve a family mismatch by switching to an EVM network. */
export function resolveTronAccount(scope: AccountScope): string {
  try {
    return scope.resolveAddress("tron");
  } catch (error) {
    if (error instanceof UsageError && error.code === "family_mismatch")
      throw new UsageError(
        "family_mismatch",
        "this command supports TRON only; select an account with a TRON address using --account, or switch the active account",
      );
    throw error;
  }
}

// Nodes return an empty record for an inactive account.
export async function activeTronAccount(
  gateways: ChainGatewayProvider,
  network: NetworkDescriptor,
  owner: string,
): Promise<TronAccount> {
  const account = await gateways.get(network, "tron").getAccount(owner);
  if (!account.address) {
    throw new ChainError(
      "account_not_active",
      `${owner} is not activated on ${network.id}; it must receive TRX before it can send a transaction`,
    );
  }
  return account;
}
