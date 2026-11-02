import { parse as parseLosslessJson } from "lossless-json";
import type { Types } from "tronweb";
import type { ActivePermissionView, PermissionGroupView } from "../../../../domain/types/index.js";
import type {
  TronAccountState,
  TronRawAccount,
  TronResourceUsage,
  TronStakeTotals,
  TronUnfreezing,
  TronVote,
} from "../../../../application/ports/chain/tron/tron-gateway.js";
import { ChainError } from "../../../../domain/errors/index.js";
import { tronHexToBase58 } from "../../../../domain/address/index.js";
import { addressCodec } from "../../../../domain/family/index.js";
import {
  decodeOperations,
  isActivePermissionId,
} from "../../../../domain/tron/permission/index.js";
import {
  nodeQuantity,
  normalizeAccountValue,
  optionalNodeTime,
  safeNodeInteger,
} from "./node-values.js";

// Preserve account quantities as exact decimal strings.
interface TronAccountAsset {
  key?: string;
  value?: string;
  [key: string]: unknown;
}

interface TronFrozenBalance {
  type?: unknown;
  amount?: string;
  unfreeze_amount?: string;
  frozen_balance?: string;
  [key: string]: unknown;
}

interface TronVoteAllocation {
  vote_address?: unknown;
  voteAddress?: unknown;
  vote_count?: unknown;
  voteCount?: unknown;
  [key: string]: unknown;
}

// Node account JSON; SUN and token quantities are decimal strings.
export interface NodeAccount {
  balance?: string;
  allowance?: string;
  asset?: TronAccountAsset[];
  assetV2?: TronAccountAsset[];
  frozen?: TronFrozenBalance[];
  frozenV2?: TronFrozenBalance[];
  unfrozenV2?: TronFrozenBalance[];
  votes?: TronVoteAllocation[];
  [key: string]: unknown;
}

export function parseTronAccountResponse(text: string): NodeAccount {
  return normalizeAccountValue(parseLosslessJson(text)) as NodeAccount;
}

// Protobuf JSON omits zero-valued counters.
export function tronResourceUsage(resources: Types.AccountResourceMessage): TronResourceUsage {
  const count = (field: keyof Types.AccountResourceMessage): number =>
    resources[field] === undefined ? 0 : safeNodeInteger(resources[field], field);
  return {
    energy: { used: count("EnergyUsed"), limit: count("EnergyLimit") },
    bandwidth: {
      used: count("NetUsed") + count("freeNetUsed"),
      limit: count("NetLimit") + count("freeNetLimit"),
    },
    votingPower: { total: count("tronPowerLimit"), used: count("tronPowerUsed") },
  };
}

// Protobuf JSON omits zero values: an absent quantity is 0, an absent frozenV2 type is BANDWIDTH.
export function tronAccountState(account: NodeAccount, expected?: string): TronAccountState {
  const address = nodeAccountAddress(account.address, "account address", expected);
  const name = accountText(account.account_name, "account_name");
  const id = accountText(account.account_id, "account_id");
  const createdAt = optionalNodeTime(account.create_time, "create_time");
  const latestWithdrawAt = optionalNodeTime(account.latest_withdraw_time, "latest_withdraw_time");
  return {
    ...(address === undefined ? {} : { address }),
    balanceSun: nodeQuantity(account.balance, "balance"),
    ...(name === undefined ? {} : { name }),
    ...(id === undefined ? {} : { id }),
    ...(createdAt === undefined ? {} : { createdAt }),
    ...(latestWithdrawAt === undefined ? {} : { latestWithdrawAt }),
    stake: stakeTotals(account.frozenV2 ?? []),
    unfreezing: (account.unfrozenV2 ?? []).map(unfreezingEntry),
    votes: (account.votes ?? []).flatMap(accountVote),
    raw: account as unknown as TronRawAccount,
  };
}

// Entries of any other type are not counted.
function stakeTotals(entries: readonly TronFrozenBalance[]): TronStakeTotals {
  const sums = { BANDWIDTH: 0n, ENERGY: 0n, TRON_POWER: 0n };
  for (const entry of entries) {
    const type = entry.type ?? "BANDWIDTH";
    if (type !== "BANDWIDTH" && type !== "ENERGY" && type !== "TRON_POWER") continue;
    sums[type] += BigInt(nodeQuantity(entry.amount, "frozenV2 amount"));
  }
  return {
    energySun: sums.ENERGY.toString(),
    bandwidthSun: sums.BANDWIDTH.toString(),
    tronPowerSun: sums.TRON_POWER.toString(),
    totalSun: (sums.ENERGY + sums.BANDWIDTH + sums.TRON_POWER).toString(),
  };
}

function unfreezingEntry(entry: TronFrozenBalance): TronUnfreezing {
  const withdrawableAt = optionalNodeTime(entry.unfreeze_expire_time, "unfreeze_expire_time");
  if (withdrawableAt === undefined) {
    throw new ChainError("provider_error", "TRON node returned an unfrozenV2 entry without expiry");
  }
  return { amountSun: nodeQuantity(entry.unfreeze_amount, "unfreeze_amount"), withdrawableAt };
}

function accountVote(vote: TronVoteAllocation): TronVote[] {
  const count = nodeQuantity(vote.vote_count, "vote_count");
  if (count === "0") return [];
  const witness = nodeAccountAddress(vote.vote_address, "vote address");
  if (witness === undefined) {
    throw new ChainError("provider_error", "TRON node returned a vote without an address");
  }
  return [{ witness, count }];
}

function nodeAccountAddress(raw: unknown, field: string, expected?: string): string | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string") {
    throw new ChainError("provider_error", `TRON node returned a malformed ${field}`);
  }
  const address = tronHexToBase58(raw);
  if (!addressCodec("tron").validate(address)) {
    throw new ChainError("provider_error", `TRON node returned an invalid ${field}`);
  }
  if (expected !== undefined && address !== expected) {
    throw new ChainError(
      "provider_error",
      "TRON node returned an account address different from the query",
    );
  }
  return address;
}

// Account text is hex-encoded bytes; bytes that are not UTF-8 decode to U+FFFD.
function accountText(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !/^(?:[0-9a-fA-F]{2})+$/.test(value)) {
    throw new ChainError("provider_error", `TRON node returned malformed ${field}`);
  }
  return Buffer.from(value, "hex").toString("utf8");
}

function safePermissionName(value: unknown, fallback: string, field: string): string {
  const name = value === undefined ? fallback : value;
  if (
    typeof name !== "string" ||
    name.length === 0 ||
    Buffer.byteLength(name, "utf8") > 32 ||
    /\p{Cc}/u.test(name)
  ) {
    throw new ChainError("provider_error", `TRON node returned an invalid ${field}`);
  }
  return name;
}

export function permissionGroupFromNode(
  value: unknown,
  kind: string,
  fallbackId: number,
  constraints: { expectedId?: number; exactKeys?: number } = {},
): PermissionGroupView {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ChainError("provider_error", `TRON node returned malformed ${kind} permission data`);
  }
  const raw = value as Record<string, unknown>;
  if (
    !Array.isArray(raw.keys) ||
    raw.keys.length === 0 ||
    raw.keys.length > 5 ||
    (constraints.exactKeys !== undefined && raw.keys.length !== constraints.exactKeys)
  ) {
    throw new ChainError("provider_error", `TRON node returned an invalid ${kind} key count`);
  }
  const threshold = safeNodeInteger(raw.threshold, `${kind}.threshold`);
  if (threshold === 0)
    throw new ChainError("provider_error", `TRON node returned zero ${kind} threshold`);
  const seen = new Set<string>();
  let totalWeight = 0n;
  const keys = raw.keys.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new ChainError("provider_error", `TRON node returned malformed ${kind}.keys[${index}]`);
    }
    const key = entry as Record<string, unknown>;
    const address = tronHexToBase58(key.address);
    const weight = safeNodeInteger(key.weight, `${kind}.keys[${index}].weight`);
    if (!addressCodec("tron").validate(address) || weight === 0 || seen.has(address)) {
      throw new ChainError("provider_error", `TRON node returned invalid ${kind}.keys[${index}]`);
    }
    seen.add(address);
    totalWeight += BigInt(weight);
    return { address, weight, local: null };
  });
  if (BigInt(threshold) > totalWeight) {
    throw new ChainError(
      "provider_error",
      `TRON node returned ${kind} threshold above total key weight`,
    );
  }
  const id = raw.id === undefined ? fallbackId : safeNodeInteger(raw.id, `${kind}.id`);
  if (constraints.expectedId !== undefined && id !== constraints.expectedId) {
    throw new ChainError("provider_error", `TRON node returned invalid ${kind} permission id`);
  }
  return {
    id,
    name: safePermissionName(raw.permission_name, kind, `${kind}.permission_name`),
    threshold,
    keys,
  };
}

export function activePermissionFromNode(value: unknown, index: number): ActivePermissionView {
  const group = permissionGroupFromNode(value, `active[${index}]`, index + 2);
  if (!isActivePermissionId(group.id)) {
    throw new ChainError(
      "provider_error",
      `TRON node returned invalid active[${index}] permission id`,
    );
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.operations !== "string") {
    throw new ChainError(
      "provider_error",
      `TRON node returned active[${index}] without operations`,
    );
  }
  let operations: ReturnType<typeof decodeOperations>;
  try {
    operations = decodeOperations(raw.operations);
  } catch {
    throw new ChainError(
      "provider_error",
      `TRON node returned malformed active[${index}] operations`,
    );
  }
  return {
    ...group,
    operations: operations.operations,
    operationLabels: operations.labels,
    operationsHex: operations.operationsHex,
    unknownOperationIds: operations.unknownOperationIds,
  };
}
