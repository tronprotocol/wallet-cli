import type {
  AccountDescriptor,
  AccountPermissionsView,
  ActivePermissionView,
  PermissionGroupView,
  PermissionKeyView,
  WarningView,
} from "../types/index.js";
import { UsageError } from "../errors/index.js";
import { TronAddress } from "../address/index.js";

const OPERATIONS_BYTES = 32;
const MAX_KEYS = 5;
const MAX_ACTIVES = 8;
const MAX_PERMISSION_NAME_BYTES = 32;
const addressCodec = new TronAddress();

export interface TronOperation {
  contractTypeId: number;
  contractType: string;
  label: string;
}

/** Authoritative mapping shared by permission bitmaps, display labels, and authorization checks. */
export const TRON_OPERATIONS: readonly TronOperation[] = Object.freeze([
  { contractTypeId: 0, contractType: "AccountCreateContract", label: "Activate Account" },
  { contractTypeId: 1, contractType: "TransferContract", label: "Transfer TRX" },
  { contractTypeId: 2, contractType: "TransferAssetContract", label: "Transfer TRC10" },
  { contractTypeId: 4, contractType: "VoteWitnessContract", label: "Vote" },
  { contractTypeId: 5, contractType: "WitnessCreateContract", label: "Apply to Become a SR Candidate" },
  { contractTypeId: 6, contractType: "AssetIssueContract", label: "Issue TRC10" },
  { contractTypeId: 8, contractType: "WitnessUpdateContract", label: "Update SR Info" },
  { contractTypeId: 9, contractType: "ParticipateAssetIssueContract", label: "Participate in TRC10 Issuance" },
  { contractTypeId: 10, contractType: "AccountUpdateContract", label: "Update Account Name" },
  { contractTypeId: 11, contractType: "FreezeBalanceContract", label: "TRX Stake (1.0)" },
  { contractTypeId: 12, contractType: "UnfreezeBalanceContract", label: "TRX Unstake (1.0)" },
  { contractTypeId: 13, contractType: "WithdrawBalanceContract", label: "Claim Voting Rewards" },
  { contractTypeId: 14, contractType: "UnfreezeAssetContract", label: "Unstake TRC10" },
  { contractTypeId: 15, contractType: "UpdateAssetContract", label: "Update TRC10 Parameters" },
  { contractTypeId: 16, contractType: "ProposalCreateContract", label: "Create Proposal" },
  { contractTypeId: 17, contractType: "ProposalApproveContract", label: "Approve Proposal" },
  { contractTypeId: 18, contractType: "ProposalDeleteContract", label: "Cancel Proposal" },
  { contractTypeId: 19, contractType: "SetAccountIdContract", label: "Set Account Id" },
  { contractTypeId: 30, contractType: "CreateSmartContract", label: "Create Smart Contract" },
  { contractTypeId: 31, contractType: "TriggerSmartContract", label: "Trigger Smart Contract" },
  { contractTypeId: 33, contractType: "UpdateSettingContract", label: "Update Contract Parameters" },
  { contractTypeId: 41, contractType: "ExchangeCreateContract", label: "Create Bancor Transaction" },
  { contractTypeId: 42, contractType: "ExchangeInjectContract", label: "Inject Assets into Bancor Transaction" },
  { contractTypeId: 43, contractType: "ExchangeWithdrawContract", label: "Withdraw Assets from Bancor Transaction" },
  { contractTypeId: 44, contractType: "ExchangeTransactionContract", label: "Execute Bancor Transaction" },
  { contractTypeId: 45, contractType: "UpdateEnergyLimitContract", label: "Update Contract Energy Limit" },
  { contractTypeId: 46, contractType: "AccountPermissionUpdateContract", label: "Update Account Permissions" },
  { contractTypeId: 48, contractType: "ClearABIContract", label: "Clear Contract ABI" },
  { contractTypeId: 49, contractType: "UpdateBrokerageContract", label: "Update SR Commission Ratio" },
  { contractTypeId: 52, contractType: "MarketSellAssetContract", label: "Market Sell Asset" },
  { contractTypeId: 53, contractType: "MarketCancelOrderContract", label: "Market Cancel Order" },
  { contractTypeId: 54, contractType: "FreezeBalanceV2Contract", label: "TRX Stake (2.0)" },
  { contractTypeId: 55, contractType: "UnfreezeBalanceV2Contract", label: "TRX Unstake (2.0)" },
  { contractTypeId: 56, contractType: "WithdrawExpireUnfreezeContract", label: "Withdraw Unstaked TRX" },
  { contractTypeId: 57, contractType: "DelegateResourceContract", label: "Delegate Resources" },
  { contractTypeId: 58, contractType: "UnDelegateResourceContract", label: "Reclaim Resources" },
  { contractTypeId: 59, contractType: "CancelAllUnfreezeV2Contract", label: "Cancel Unstake" },
]);

const operationByType = new Map(TRON_OPERATIONS.map((operation) => [operation.contractType, operation]));
const operationById = new Map(TRON_OPERATIONS.map((operation) => [operation.contractTypeId, operation]));

function invalidPermission(message: string, details?: object): never {
  throw new UsageError("invalid_permission", message, details);
}

function ownRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return invalidPermission(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function safePositiveInteger(value: unknown, field: string): number {
  let text: string;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) return invalidPermission(`${field} must be a safe integer`);
    text = String(value);
  } else if (typeof value === "bigint") {
    text = value.toString();
  } else if (typeof value === "string" && /^(?:0|[1-9][0-9]*)$/.test(value)) {
    text = value;
  } else if (value && typeof value === "object" && typeof (value as { toString?: unknown }).toString === "function") {
    text = String(value);
  } else {
    return invalidPermission(`${field} must be an integer`);
  }
  if (!/^[1-9][0-9]*$/.test(text)) return invalidPermission(`${field} must be greater than zero`);
  const integer = BigInt(text);
  if (integer > BigInt(Number.MAX_SAFE_INTEGER)) {
    return invalidPermission(`${field} exceeds the precise integer range supported by TronWeb`);
  }
  return Number(integer);
}

function exactInteger(value: unknown, expected: number, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value !== expected) {
    return invalidPermission(`${field} must be ${expected}`);
  }
  return value;
}

function permissionName(value: unknown, fallback: string, field: string): string {
  const name = value === undefined ? fallback : value;
  if (typeof name !== "string" || name.length === 0) return invalidPermission(`${field} must not be empty`);
  if (Buffer.byteLength(name, "utf8") > MAX_PERMISSION_NAME_BYTES) {
    return invalidPermission(`${field} must be at most ${MAX_PERMISSION_NAME_BYTES} UTF-8 bytes`);
  }
  if (/\p{Cc}/u.test(name)) return invalidPermission(`${field} must not contain control characters`);
  return name;
}

function keys(value: unknown, field: string, exactCount?: number): PermissionKeyView[] {
  if (!Array.isArray(value)
    || value.length < 1
    || value.length > MAX_KEYS
    || (exactCount !== undefined && value.length !== exactCount)) {
    return invalidPermission(
      exactCount === undefined
        ? `${field} must contain 1 to ${MAX_KEYS} keys`
        : `${field} must contain exactly ${exactCount} key`,
    );
  }
  const seen = new Set<string>();
  return value.map((entry, index) => {
    const item = ownRecord(entry, `${field}[${index}]`);
    if (typeof item.address !== "string" || !addressCodec.validate(item.address)) {
      return invalidPermission(`${field}[${index}].address is not a valid TRON address`);
    }
    if (seen.has(item.address)) return invalidPermission(`${field} contains a duplicate address`);
    seen.add(item.address);
    return {
      address: item.address,
      weight: safePositiveInteger(item.weight, `${field}[${index}].weight`),
      local: null,
    };
  });
}

function group(value: unknown, kind: "owner" | "witness", expectedId: 0 | 1): PermissionGroupView {
  const input = ownRecord(value, kind);
  if (input.operations !== undefined || input.operationsHex !== undefined) {
    return invalidPermission(`${kind} permission must not define operations`);
  }
  const parsedKeys = keys(input.keys, `${kind}.keys`, kind === "witness" ? 1 : undefined);
  const threshold = safePositiveInteger(input.threshold, `${kind}.threshold`);
  const total = parsedKeys.reduce((sum, key) => sum + BigInt(key.weight), 0n);
  if (BigInt(threshold) > total) return invalidPermission(`${kind}.threshold exceeds the total key weight`);
  return {
    id: exactInteger(input.id, expectedId, `${kind}.id`),
    name: permissionName(input.name, kind, `${kind}.name`),
    threshold,
    keys: parsedKeys,
  };
}

export interface DecodedOperations {
  operations: string[];
  labels: string[];
  unknownOperationIds: number[];
  operationsHex: string;
}

export function decodeOperations(input: string): DecodedOperations {
  const operationsHex = input.trim().replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(operationsHex)) {
    return invalidPermission("operationsHex must be exactly 32 bytes of hex");
  }
  const bytes = Buffer.from(operationsHex, "hex");
  const operations: string[] = [];
  const labels: string[] = [];
  const unknownOperationIds: number[] = [];
  for (let id = 0; id < OPERATIONS_BYTES * 8; id += 1) {
    if ((bytes[Math.floor(id / 8)]! & (1 << (id % 8))) === 0) continue;
    const operation = operationById.get(id);
    if (operation) {
      operations.push(operation.contractType);
      labels.push(operation.label);
    } else {
      unknownOperationIds.push(id);
    }
  }
  return { operations, labels, unknownOperationIds, operationsHex };
}

export function encodeOperations(contractTypes: readonly string[]): string {
  if (!Array.isArray(contractTypes) || contractTypes.length === 0) {
    return invalidPermission("active.operations must contain at least one contract type");
  }
  const bytes = Buffer.alloc(OPERATIONS_BYTES);
  const seen = new Set<string>();
  for (const contractType of contractTypes) {
    if (typeof contractType !== "string") return invalidPermission("active.operations entries must be strings");
    if (seen.has(contractType)) continue;
    seen.add(contractType);
    const operation = operationByType.get(contractType);
    if (!operation) return invalidPermission(`unknown TRON contract type: ${contractType}`);
    bytes[Math.floor(operation.contractTypeId / 8)]! |= 1 << (operation.contractTypeId % 8);
  }
  return bytes.toString("hex");
}

function activeGroup(value: unknown, index: number): ActivePermissionView {
  const input = ownRecord(value, `actives[${index}]`);
  if (typeof input.id !== "number" || !Number.isSafeInteger(input.id) || input.id < 2 || input.id > 9) {
    return invalidPermission(`actives[${index}].id must be an integer from 2 to 9`);
  }
  if (!Array.isArray(input.operations)) {
    return invalidPermission(`actives[${index}].operations must be an array`);
  }
  const operationsHex = encodeOperations(input.operations as string[]);
  if (input.operationsHex !== undefined) {
    if (typeof input.operationsHex !== "string" || decodeOperations(input.operationsHex).operationsHex !== operationsHex) {
      return invalidPermission(`actives[${index}].operationsHex does not match operations`);
    }
  }
  const decoded = decodeOperations(operationsHex);
  const parsedKeys = keys(input.keys, `actives[${index}].keys`);
  const threshold = safePositiveInteger(input.threshold, `actives[${index}].threshold`);
  const total = parsedKeys.reduce((sum, key) => sum + BigInt(key.weight), 0n);
  if (BigInt(threshold) > total) {
    return invalidPermission(`actives[${index}].threshold exceeds the total key weight`);
  }
  return {
    id: input.id,
    name: permissionName(input.name, "active", `actives[${index}].name`),
    threshold,
    keys: parsedKeys,
    operations: decoded.operations,
    operationLabels: decoded.labels,
    operationsHex,
    unknownOperationIds: [],
  };
}

/** Strictly validate and canonicalize the complete replacement structure. */
export function validatePermissionStructure(value: unknown, expectedAddress?: string): AccountPermissionsView {
  const input = ownRecord(value, "permission structure");
  if (expectedAddress !== undefined && input.address !== undefined && input.address !== expectedAddress) {
    return invalidPermission("permission structure address does not match the selected account");
  }
  const address = expectedAddress ?? input.address;
  if (typeof address !== "string" || !addressCodec.validate(address)) {
    return invalidPermission("permission structure address is not a valid TRON address");
  }
  const owner = group(input.owner, "owner", 0);
  const witness = input.witness === undefined || input.witness === null
    ? null
    : group(input.witness, "witness", 1);
  const activeInput = input.actives ?? [];
  if (!Array.isArray(activeInput) || activeInput.length > MAX_ACTIVES) {
    return invalidPermission(`actives must contain at most ${MAX_ACTIVES} permission groups`);
  }
  const actives = activeInput.map(activeGroup);
  const ids = new Set<number>();
  for (const active of actives) {
    if (ids.has(active.id)) return invalidPermission("active permission ids must be unique");
    ids.add(active.id);
  }
  return { address, owner, witness, actives };
}

export type LocalPermissionInventory = ReadonlyMap<string, string>;

/** Watch-only accounts are excluded because they cannot contribute a signature. */
export function buildLocalPermissionInventory(accounts: readonly AccountDescriptor[]): LocalPermissionInventory {
  const inventory = new Map<string, string>();
  for (const account of accounts) {
    if (account.type === "watch") continue;
    const address = account.addresses.tron;
    if (!address || inventory.has(address)) continue;
    inventory.set(address, account.label ?? String(account.accountId));
  }
  return inventory;
}

export function annotateLocalPermissionKeys(
  permissions: AccountPermissionsView,
  inventory: LocalPermissionInventory,
): AccountPermissionsView {
  const annotate = (permission: PermissionGroupView): PermissionGroupView => ({
    ...permission,
    keys: permission.keys.map((key) => ({ ...key, local: inventory.get(key.address) ?? null })),
  });
  return {
    ...permissions,
    owner: annotate(permissions.owner),
    witness: permissions.witness ? annotate(permissions.witness) : null,
    actives: permissions.actives.map((active) => ({ ...active, ...annotate(active) })),
  };
}

export function permissionSafetyWarnings(
  permissions: AccountPermissionsView,
  inventory: LocalPermissionInventory,
): WarningView[] {
  const localOwnerWeight = permissions.owner.keys.reduce(
    (sum, key) => inventory.has(key.address) ? sum + key.weight : sum,
    0,
  );
  const warnings: WarningView[] = [];
  if (localOwnerWeight === 0) {
    warnings.push({
      code: "owner_lockout",
      message: "local signing keys hold no owner weight; applying this structure may permanently lock out this wallet",
    });
  } else if (localOwnerWeight < permissions.owner.threshold) {
    warnings.push({
      code: "owner_lockout_partial",
      message: `local keys hold ${localOwnerWeight} of ${permissions.owner.threshold} owner weight; co-signers are required for owner-level operations`,
    });
  }
  for (const active of permissions.actives) {
    if (active.operations.includes("AccountPermissionUpdateContract")) {
      warnings.push({
        code: "active_can_update_permission",
        message: `active permission ${active.name} (id ${active.id}) can replace the account permission structure`,
      });
    }
  }
  return warnings;
}

export function operationForContractType(contractType: string): TronOperation | undefined {
  return operationByType.get(contractType);
}
