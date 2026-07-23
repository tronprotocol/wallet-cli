import type { AccountPermissionsView, NetworkDescriptor } from "../../../domain/types/index.js";
import { ChainError } from "../../../domain/errors/index.js";
import {
  annotateLocalPermissionKeys,
  buildLocalPermissionInventory,
  permissionSafetyWarnings,
  validatePermissionStructure,
} from "../../../domain/permission/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { AccountStore } from "../../ports/account-store.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import {
  outcomeData,
  transactionMode,
  transactionRequiresSigner,
  type TransactionModeInput,
} from "../../services/transaction-mode.js";
import { tronConfirmation } from "../../services/tron-confirmation.js";
import { assertTronSignerAuthorized } from "./multisig-authorization.js";

export class TronPermissionService {
  constructor(
    private readonly gateways: ChainGatewayProvider,
    private readonly accounts: Pick<AccountStore, "list">,
    private readonly pipeline: TxPipeline,
  ) {}

  async show(network: NetworkDescriptor, address: string): Promise<AccountPermissionsView> {
    const permissions = await this.gateways.get(network, "tron").getAccountPermissions(address);
    return annotateLocalPermissionKeys(permissions, buildLocalPermissionInventory(this.accounts.list()));
  }

  async update(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: TransactionModeInput,
    requested: unknown,
  ) {
    const gateway = this.gateways.get(network, "tron");
    const address = scope.resolveAddress("tron");
    if (transactionRequiresSigner(input)) this.pipeline.assertCanSign(scope.activeAccount, "tron");
    const inventory = buildLocalPermissionInventory(this.accounts.list());
    const permissions = annotateLocalPermissionKeys(
      validatePermissionStructure(requested, address),
      inventory,
    );
    for (const warning of permissionSafetyWarnings(permissions, inventory)) scope.warn(warning);

    const mode = transactionMode(input);
    const [feeSun, balanceSun] = await Promise.all([
      gateway.getUpdateAccountPermissionFee(),
      gateway.getNativeBalance(address),
    ]);
    if (mode.mode === "broadcast" && BigInt(balanceSun) < BigInt(feeSun)) {
      throw new ChainError(
        "insufficient_balance",
        `account balance ${balanceSun} SUN is below the ${feeSun} SUN permission update fee`,
      );
    }

    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...mode,
      prepare: (tx, options) => gateway.prepareTransaction(tx, options),
      artifact: (tx) => gateway.encodeTransactionHex(tx),
      preflight: (tx, signer) => assertTronSignerAuthorized(gateway, tx, signer),
      confirm: tronConfirmation(gateway, scope),
      build: () => gateway.buildAccountPermissionUpdate(address, permissions),
      estimate: async () => ({ feeModel: "tron-resource", feeSun, balanceSun }),
    });

    let resultPermissions: AccountPermissionsView | undefined;
    if (outcome.stage === "confirmed") {
      resultPermissions = await this.show(network, address);
      if (canonicalPermissions(resultPermissions) !== canonicalPermissions(permissions)) {
        scope.warn({
          code: "permission_postcheck_mismatch",
          message: "confirmed transaction permissions differ from the requested canonical structure",
        });
      }
    } else if (outcome.stage === "plan" || outcome.stage === "built" || outcome.stage === "signed") {
      resultPermissions = permissions;
    }
    return {
      kind: "permission-update" as const,
      ...outcomeData(outcome),
      ...(resultPermissions ? { permissions: resultPermissions } : {}),
    };
  }
}

function canonicalPermissions(value: AccountPermissionsView): string {
  const key = ({ address, weight }: { address: string; weight: number }) => ({ address, weight });
  const group = (permission: AccountPermissionsView["owner"]) => ({
    id: permission.id,
    name: permission.name,
    threshold: permission.threshold,
    keys: permission.keys.map(key),
  });
  return JSON.stringify({
    address: value.address,
    owner: group(value.owner),
    witness: value.witness ? group(value.witness) : null,
    actives: value.actives.map((permission) => ({
      ...group(permission),
      operationsHex: permission.operationsHex,
    })),
  });
}
