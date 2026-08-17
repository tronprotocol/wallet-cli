import { UsageError } from "../errors/index.js";

export interface ChainParameterDefinition {
  id: number;
  name: string;
  unit: string;
  min: bigint;
  max: bigint;
  allowed?: readonly bigint[];
}

export interface ChainParameterChange {
  id: number;
  name: string;
  currentValue: number | string | null;
  proposedValue: number | string;
  unit: string;
}

export interface ChainParameterValue {
  id: number;
  name: string;
  value: number | string;
  unit: string;
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const INT64_MAX = (1n << 63n) - 1n;
const BOOL = [0n, 1n] as const;

const names: ReadonlyArray<readonly [number, string]> = [
  [0, "getMaintenanceTimeInterval"],
  [1, "getAccountUpgradeCost"],
  [2, "getCreateAccountFee"],
  [3, "getTransactionFee"],
  [4, "getAssetIssueFee"],
  [5, "getWitnessPayPerBlock"],
  [6, "getWitnessStandbyAllowance"],
  [7, "getCreateNewAccountFeeInSystemContract"],
  [8, "getCreateNewAccountBandwidthRate"],
  [9, "getAllowCreationOfContracts"],
  [10, "getRemoveThePowerOfTheGr"],
  [11, "getEnergyFee"],
  [12, "getExchangeCreateFee"],
  [13, "getMaxCpuTimeOfOneTx"],
  [14, "getAllowUpdateAccountName"],
  [15, "getAllowSameTokenName"],
  [16, "getAllowDelegateResource"],
  [17, "getTotalEnergyLimit"],
  [18, "getAllowTvmTransferTrc10"],
  [19, "getTotalEnergyCurrentLimit"],
  [20, "getAllowMultiSign"],
  [21, "getAllowAdaptiveEnergy"],
  [22, "getUpdateAccountPermissionFee"],
  [23, "getMultiSignFee"],
  [24, "getAllowProtoFilterNum"],
  [25, "getAllowAccountStateRoot"],
  [26, "getAllowTvmConstantinople"],
  [29, "getAdaptiveResourceLimitMultiplier"],
  [30, "getAllowChangeDelegation"],
  [31, "getWitness127PayPerBlock"],
  [32, "getAllowTvmSolidity059"],
  [33, "getAdaptiveResourceLimitTargetRatio"],
  [35, "getForbidTransferToContract"],
  [39, "getAllowShieldedTRC20Transaction"],
  [40, "getAllowPBFT"],
  [41, "getAllowTvmIstanbul"],
  [44, "getAllowMarketTransaction"],
  [45, "getMarketSellFee"],
  [46, "getMarketCancelFee"],
  [47, "getMaxFeeLimit"],
  [48, "getAllowTransactionFeePool"],
  [49, "getAllowBlackHoleOptimization"],
  [51, "getAllowNewResourceModel"],
  [52, "getAllowTvmFreeze"],
  [53, "getAllowAccountAssetOptimization"],
  [59, "getAllowTvmVote"],
  [60, "getAllowTvmCompatibleEvm"],
  [61, "getFreeNetLimit"],
  [62, "getTotalNetLimit"],
  [63, "getAllowTvmLondon"],
  [65, "getAllowHigherLimitForMaxCpuTimeOfOneTx"],
  [66, "getAllowAssetOptimization"],
  [67, "getAllowNewReward"],
  [68, "getMemoFee"],
  [69, "getAllowDelegateOptimization"],
  [70, "getUnfreezeDelayDays"],
  [71, "getAllowOptimizedReturnValueOfChainId"],
  [72, "getAllowDynamicEnergy"],
  [73, "getDynamicEnergyThreshold"],
  [74, "getDynamicEnergyIncreaseFactor"],
  [75, "getDynamicEnergyMaxFactor"],
  [76, "getAllowTvmShanghai"],
  [77, "getAllowCancelAllUnfreezeV2"],
  [78, "getMaxDelegateLockPeriod"],
  [79, "getAllowOldRewardOpt"],
  [81, "getAllowEnergyAdjustment"],
  [82, "getMaxCreateAccountTxSize"],
  [83, "getAllowTvmCancun"],
  [87, "getAllowStrictMath"],
  [88, "getConsensusLogicOptimization"],
  [89, "getAllowTvmBlob"],
  [92, "getProposalExpireTime"],
  [94, "getAllowTvmSelfdestructRestriction"],
  [95, "getAllowTvmPrague"],
  [96, "getAllowTvmOsaka"],
  [97, "getAllowHardenResourceCalculation"],
  [98, "getAllowHardenExchangeCalculation"],
];

const booleanIds = new Set([
  9, 10, 14, 15, 16, 18, 20, 21, 24, 25, 26, 30, 32, 35, 39, 40, 41, 44, 48, 49, 51, 52, 53, 59, 60,
  63, 65, 66, 67, 69, 71, 72, 76, 77, 79, 81, 83, 87, 88, 89, 94, 95, 96, 97, 98,
]);

const ranges = new Map<number, readonly [bigint, bigint]>([
  [0, [81_000n, 86_400_000n]],
  [13, [0n, 1_000n]],
  [29, [1n, 10_000n]],
  [33, [1n, 1_000n]],
  [61, [0n, 100_000n]],
  [62, [0n, 1_000_000_000_000n]],
  [68, [0n, 1_000_000_000n]],
  [70, [1n, 365n]],
  [74, [0n, 10_000n]],
  [75, [0n, 100_000n]],
  [78, [86_401n, 10_512_000n]],
  [82, [500n, 10_000n]],
  [92, [1n, 31_536_003_000n]],
]);

const units: Readonly<Record<string, string>> = {
  getMaintenanceTimeInterval: "ms",
  getAccountUpgradeCost: "sun",
  getCreateAccountFee: "sun",
  getTransactionFee: "sun/byte",
  getAssetIssueFee: "sun",
  getWitnessPayPerBlock: "sun",
  getWitnessStandbyAllowance: "sun",
  getCreateNewAccountFeeInSystemContract: "sun",
  getEnergyFee: "sun",
  getExchangeCreateFee: "sun",
  getMaxCpuTimeOfOneTx: "ms",
  getUpdateAccountPermissionFee: "sun",
  getMultiSignFee: "sun",
  getWitness127PayPerBlock: "sun",
  getMarketSellFee: "sun",
  getMarketCancelFee: "sun",
  getMaxFeeLimit: "sun",
  getMemoFee: "sun",
  getProposalExpireTime: "ms",
};

export const CHAIN_PARAMETER_CATALOG: readonly ChainParameterDefinition[] = names.map(
  ([id, name]) => {
    const [min, max] = ranges.get(id) ?? [0n, INT64_MAX];
    return {
      id,
      name,
      unit: units[name] ?? "",
      min,
      max,
      ...(booleanIds.has(id) ? { allowed: BOOL } : {}),
    };
  },
);

const byId = new Map(CHAIN_PARAMETER_CATALOG.map((entry) => [entry.id, entry]));
const byName = new Map(CHAIN_PARAMETER_CATALOG.map((entry) => [entry.name.toLowerCase(), entry]));

export function chainParameterById(id: number): ChainParameterDefinition | undefined {
  return byId.get(id);
}

export function chainParameterByName(name: string): ChainParameterDefinition | undefined {
  return byName.get(name.toLowerCase());
}

export function parseChainParameterAssignments(
  assignments: readonly string[],
  current: ReadonlyArray<{ key: string; value?: number | string }>,
): ChainParameterChange[] {
  const currentByName = new Map(current.map((entry) => [entry.key.toLowerCase(), entry.value]));
  const selected = new Map<number, ChainParameterChange>();
  for (const assignment of assignments) {
    const separator = assignment.indexOf("=");
    if (separator <= 0 || separator === assignment.length - 1) {
      throw new UsageError(
        "invalid_value",
        `invalid --set '${assignment}'; expected <name|id>=<value>`,
      );
    }
    const key = assignment.slice(0, separator).trim();
    const rawValue = assignment.slice(separator + 1).trim();
    const definition = /^\d+$/.test(key) ? byId.get(Number(key)) : byName.get(key.toLowerCase());
    if (!definition) throw new UsageError("unknown_parameter", `unknown chain parameter: ${key}`);
    if (!/^-?\d+$/.test(rawValue)) {
      throw new UsageError("invalid_value", `${definition.name} value must be an integer`);
    }
    const value = BigInt(rawValue);
    if (definition.allowed && !definition.allowed.includes(value)) {
      throw new UsageError(
        "invalid_value",
        `${definition.name} must be ${definition.allowed.join(" or ")}`,
      );
    }
    if (!definition.allowed && (value < definition.min || value > definition.max)) {
      throw new UsageError(
        "invalid_value",
        `${definition.name} must be between ${definition.min} and ${definition.max}`,
      );
    }
    const exactValue = value <= MAX_SAFE ? Number(value) : value.toString();
    selected.set(definition.id, {
      id: definition.id,
      name: definition.name,
      currentValue: currentByName.get(definition.name.toLowerCase()) ?? null,
      proposedValue: exactValue,
      unit: definition.unit,
    });
  }
  return [...selected.values()].sort((left, right) => left.id - right.id);
}

export function proposalParameters(
  parameters: Readonly<Record<string, string>>,
): ChainParameterValue[] {
  return Object.entries(parameters)
    .map(([rawId, rawValue]) => {
      const id = Number(rawId);
      const definition = byId.get(id);
      const value =
        /^-?\d+$/.test(rawValue) && BigInt(rawValue) <= MAX_SAFE ? Number(rawValue) : rawValue;
      return {
        id,
        name: definition?.name ?? `parameter-${id}`,
        value,
        unit: definition?.unit ?? "",
      };
    })
    .sort((left, right) => left.id - right.id);
}
