import { z } from "zod";
import { readFile } from "node:fs/promises";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";
import { errorMessage, UsageError } from "../../../../domain/errors/index.js";
import type { TronContractService } from "../../../../application/use-cases/tron/contract-service.js";
import type { DeployConstructorArgs } from "../../../../application/ports/chain/evm/evm-gateway.js";
import type { EvmContractService } from "../../../../application/use-cases/evm/contract-service.js";
import type { TronContractParameter } from "../../../../application/ports/chain/tron/tron-gateway.js";
import { Schemas, addressFieldsFor } from "../schemas/index.js";
import { gweiToWei } from "../../../../domain/evm/evm-gas.js";
import {
  isZeroAmount,
  toBaseUnits,
  sunAmount,
  type Sun,
} from "../../../../domain/amounts/index.js";
import { FAMILIES } from "../../../../domain/family/index.js";
import {
  governanceTxModeFields,
  tronExpirationRefine,
  tronTxModeFields,
  txModeExclusive,
  txModeFields,
} from "./shared.js";
import { TextFormatters } from "../render/index.js";
import { isOriginEnergyLimit, MAX_PERCENT } from "../../../../domain/tron/governance/limits.js";
import { DEFAULT_FEE_LIMIT_SUN } from "../../../../domain/fees/tron.js";

function jsonArray(raw: string | undefined, flag = "--params"): unknown[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (Array.isArray(value)) return value;
  } catch {
    // Fall through to the stable usage error.
  }
  throw new UsageError("invalid_value", `${flag} must be a JSON array`);
}

// Validate here so malformed entries produce a usage error before encoding.
const typedParam = z
  .object({ type: z.string().min(1), value: z.unknown() })
  .refine((e) => e.value !== undefined, { message: "value is required" });

function typedParams(raw: string | undefined): TronContractParameter[] {
  const arr = jsonArray(raw);
  if (!z.array(typedParam).safeParse(arr).success) {
    throw new UsageError(
      "invalid_value",
      '--params entries must be {"type","value"} objects with a non-empty ABI type',
    );
  }
  return arr as TronContractParameter[];
}

function typedConstructorParams(raw: string | undefined): TronContractParameter[] {
  const values = jsonArray(raw, "--constructor-params");
  if (!z.array(typedParam).safeParse(values).success) {
    throw new UsageError(
      "invalid_value",
      '--constructor-params entries must be {"type","value"} objects with a non-empty ABI type',
    );
  }
  return values as TronContractParameter[];
}
const callFields = z.object({
  contract: Schemas.address().describe("contract address"),
  method: z.string().min(1).describe("function signature, e.g. balanceOf(address)"),
  params: z
    .string()
    .optional()
    .describe("JSON array of ABI parameters as {type,value}; omit to pass no parameters"),
});

export const contractCallSpec: ChainSpec = {
  path: ["contract", "call"],
  network: "optional",
  wallet: "none",
  auth: "none",
  capability: "contract.call",
  summary: "Read-only contract call",
  description:
    "Read-only contract call. The function signature and parameter types are supplied\n" +
    "explicitly; no ABI lookup is performed.",
  baseFields: callFields,
  examples: [
    {
      cmd: `wallet-cli contract call --contract TR7... --method "balanceOf(address)" --params '[{"type":"address","value":"T..."}]' --network nile`,
    },
    {
      cmd: `wallet-cli contract call --contract 0xA0b8... --method "balanceOf(address)" --params '[{"type":"address","value":"0x742d..."}]' --network sepolia`,
    },
  ],
  formatText: TextFormatters.contractCall,
};

export const contractCallTronBinding = (svc: TronContractService): FamilyBinding => ({
  refine: addressFieldsFor("tron", "contract"),
  run: async (ctx, net, input) =>
    svc.call(ctx.deadline, net, input.contract, input.method, typedParams(input.params)),
});

export const contractCallEvmBinding = (svc: EvmContractService): FamilyBinding => ({
  refine: addressFieldsFor("evm", "contract"),
  run: async (ctx, net, input) =>
    svc.call(ctx.deadline, net, input.contract, input.method, typedParams(input.params)),
});

const sendFields = z.object({
  contract: Schemas.address().describe("contract address"),
  method: z.string().min(1).describe("function signature, e.g. transfer(address,uint256)"),
  params: z
    .string()
    .optional()
    .describe("JSON array of ABI parameters as {type,value}; omit to pass no parameters"),
  // Whole native coins; zero is valid for calls.
  value: z
    .string()
    .regex(/^\d+(\.\d+)?$/, "must be a non-negative decimal string")
    .optional()
    .describe("native coin sent with the call, in whole coins"),
  ...txModeFields,
  buildOnly: z
    .boolean()
    .default(false)
    .describe("build an unsigned transaction without signing or broadcasting"),
});

const tronContractWriteFields = z.object({
  callValueSun: Schemas.uintString()
    .optional()
    .describe("deprecated alias for --value, in SUN; removed next release"),
  feeLimit: Schemas.positiveIntString()
    .default(DEFAULT_FEE_LIMIT_SUN)
    .describe("maximum energy fee to burn, in SUN"),
  ...tronTxModeFields,
});

const evmGasFields = z.object({
  gasLimit: Schemas.positiveIntString()
    .optional()
    .describe("gas units to authorise; defaults to the node's estimate, unpadded"),
  maxFee: z
    .string()
    .optional()
    .describe("maximum total fee per gas, in gwei — 25 or 25gwei (EIP-1559 only)"),
  priorityFee: z
    .string()
    .optional()
    .describe("tip per gas, in gwei — 25 or 25gwei (EIP-1559 only)"),
  nonce: z.coerce
    .number()
    .int()
    .min(0)
    .optional()
    .describe("transaction nonce; defaults to the account's pending nonce"),
});

const evmContractWrite = {
  fields: evmGasFields,
  refine: addressFieldsFor("evm", "contract"),
};

// CLI fees are in gwei; service fees are in wei.
const withEvmFees = (input: Record<string, unknown>) => ({
  ...input,
  ...(input.maxFee === undefined ? {} : { maxFee: gweiToWei(String(input.maxFee)) }),
  ...(input.priorityFee === undefined ? {} : { priorityFee: gweiToWei(String(input.priorityFee)) }),
});

export const contractSendSpec: ChainSpec = {
  path: ["contract", "send"],
  network: "optional",
  wallet: "optional",
  auth: "conditional",
  broadcasts: true,
  capability: "contract.call",
  summary: "State-changing contract call",
  description:
    "Call a contract method that changes state, signing and broadcasting the transaction.\n" +
    "Flags marked (TRON only) or (EVM only) are accepted only on networks of that family; using one on the other family is rejected.",
  exclusive: [txModeExclusive],
  baseFields: sendFields,
  baseRefine: tronExpirationRefine,
  examples: [
    {
      cmd: `wallet-cli contract send --contract TR7... --method "transfer(address,uint256)" --params '[...]' --network nile`,
    },
    {
      cmd: `wallet-cli contract send --contract 0xA0b8... --method "transfer(address,uint256)" --params '[...]' --network sepolia`,
    },
  ],
  formatText: TextFormatters.txReceipt,
};

export const contractSendEvmBinding = (svc: EvmContractService): FamilyBinding => ({
  ...evmContractWrite,
  run: async (ctx, net, input) =>
    svc.send(ctx, net, {
      ...withEvmFees(input),
      callValue: input.value,
      params: typedParams(input.params),
    }),
});

async function creationBytecode(input: { code?: string; codeFile?: string }): Promise<string> {
  if (!input.codeFile) return checkedCreationCode(input.code!, "--code");
  let text: string;
  try {
    text = await readFile(input.codeFile, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new UsageError("file_not_found", errorMessage`code file not found: ${input.codeFile}`);
    }
    throw new UsageError("invalid_value", errorMessage`cannot read code file: ${input.codeFile}`);
  }
  return checkedCreationCode(text, `--code-file ${input.codeFile}`);
}

// Allow explicit 0x for empty deployment; reject empty input and internal whitespace.
function checkedCreationCode(raw: string, source: string): string {
  const code = raw.trim();
  const hex = code.replace(/^0x/i, "");
  if (code === "" || hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${source} must hold even-length hex creation bytecode, or exactly 0x to deploy empty code; it must not be empty`,
    );
  }
  return /^0x/i.test(code) ? `0x${hex}` : code;
}

interface DeploySource {
  bytecode: string;
  // Compiler ABI, present only for artifact input.
  abi?: unknown;
}

async function readArtifact(path: string): Promise<DeploySource> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new UsageError("file_not_found", errorMessage`artifact not found: ${path}`);
    }
    throw new UsageError("invalid_value", errorMessage`cannot read artifact: ${path}`);
  }
  let artifact: Record<string, any>;
  try {
    artifact = JSON.parse(text);
  } catch {
    throw new UsageError("invalid_value", errorMessage`artifact is not valid JSON: ${path}`);
  }
  const bytecode =
    artifact?.bytecode?.object ?? artifact?.bytecode ?? artifact?.evm?.bytecode?.object;
  if (typeof bytecode !== "string") {
    throw new UsageError(
      "invalid_value",
      errorMessage`artifact has no creation bytecode: ${path} (looked at .bytecode.object, .bytecode and .evm.bytecode.object)`,
    );
  }
  // solc emits empty bytecode for interfaces and abstract contracts.
  if (bytecode.replace(/^0x/, "") === "") {
    throw new UsageError(
      "invalid_value",
      errorMessage`artifact holds no deployable bytecode: ${path} — an interface or abstract contract cannot be deployed`,
    );
  }
  return { bytecode, ...(artifact.abi === undefined ? {} : { abi: artifact.abi }) };
}

async function deploySource(input: {
  code?: string;
  codeFile?: string;
  artifact?: string;
}): Promise<DeploySource> {
  if (input.artifact) return readArtifact(input.artifact);
  return { bytecode: await creationBytecode(input) };
}

interface DeployArgInput {
  artifact?: string;
  constructorSignature?: string;
  constructorArgs?: string;
  constructorParams?: string;
}

function constructorValues(input: DeployArgInput): unknown[] {
  if (input.constructorArgs !== undefined)
    return jsonArray(input.constructorArgs, "--constructor-args");
  return typedConstructorParams(input.constructorParams).map((entry) => entry.value);
}

function deployConstructorArgs(input: DeployArgInput, abi: unknown): DeployConstructorArgs {
  const values = constructorValues(input);
  if (abi !== undefined) return { source: "abi", abi, values };
  if (input.constructorSignature !== undefined) {
    return { source: "signature", signature: input.constructorSignature, values };
  }
  if (input.constructorParams === undefined) return { source: "none" };
  const types = typedConstructorParams(input.constructorParams).map((entry) => entry.type);
  return { source: "typed-params", types, values };
}

export const contractDeployEvmBinding = (svc: EvmContractService): FamilyBinding => ({
  fields: evmGasFields,
  run: async (ctx, net, input) => {
    const source = await deploySource(input);
    return svc.deploy(ctx, net, {
      ...withEvmFees(input),
      bytecode: source.bytecode,
      constructorArgs: deployConstructorArgs(input, source.abi),
    });
  },
});

export const contractSendTronBinding = (svc: TronContractService): FamilyBinding => ({
  fields: tronContractWriteFields,
  refine: addressFieldsFor("tron", "contract"),
  run: async (ctx, net, input) =>
    svc.send(ctx, net, {
      ...input,
      callValueSun: tronCallValueSun(input),
      feeLimit: sunAmount(input.feeLimit),
      parameters: typedParams(input.params),
    }),
});

// --value is whole TRX; --call-value-sun is SUN. Reject conflicting amount sources.
function tronCallValueSun(input: { value?: string; callValueSun?: string }): Sun {
  if (input.value !== undefined && input.callValueSun !== undefined) {
    throw new UsageError(
      "invalid_option",
      "--value and --call-value-sun set the same thing; pass only --value (--call-value-sun is deprecated)",
    );
  }
  if (input.value !== undefined) {
    return sunAmount(toBaseUnits(input.value, FAMILIES.tron.nativeDecimals, "call value"));
  }
  return sunAmount(input.callValueSun ?? "0");
}

const deployFields = z.object({
  artifact: z
    .string()
    .min(1)
    .optional()
    .describe(
      "path to a compiler artifact (Foundry, Hardhat/sunhat, TronBox) holding both the bytecode and the ABI; the preferred source, because the constructor's types then come from the compiler",
    ),
  code: z.string().min(1).optional().describe("contract creation bytecode, hex-encoded"),
  codeFile: z
    .string()
    .min(1)
    .optional()
    .describe(
      "path to a file holding the creation bytecode; bytecode often exceeds the shell's argument limit",
    ),
  constructorSignature: z
    .string()
    .min(1)
    .optional()
    .describe(
      'the constructor\'s types when there is no ABI, e.g. "constructor(uint256,string)"; not needed with --artifact, and not accepted on TRON, which needs the full ABI',
    ),
  constructorArgs: z
    .string()
    .optional()
    .describe(
      'constructor arguments as a JSON array of bare values, e.g. ["18","MyToken"]; the types come from --artifact, --constructor-signature, or --abi on TRON',
    ),
  constructorParams: z
    .string()
    .optional()
    .describe(
      'constructor arguments as a JSON array of {type,value} entries, e.g. [{"type":"uint8","value":"18"}]; prefer --constructor-args with --artifact',
    ),
  ...txModeFields,
  buildOnly: z
    .boolean()
    .default(false)
    .describe("build an unsigned transaction without signing or broadcasting"),
});

function deployRefine(
  value: {
    artifact?: string;
    code?: string;
    codeFile?: string;
    constructorSignature?: string;
    constructorArgs?: string;
    constructorParams?: string;
    expiration?: number;
    buildOnly?: boolean;
  },
  ctx: z.RefinementCtx,
): void {
  tronExpirationRefine(value, ctx);
  constructorArgsRefine(value, ctx);
}

// Reject competing argument or type sources rather than silently ignoring one.
function constructorArgsRefine(
  value: {
    artifact?: string;
    abi?: string;
    constructorSignature?: string;
    constructorArgs?: string;
    constructorParams?: string;
  },
  ctx: z.RefinementCtx,
): void {
  if (value.constructorParams !== undefined && value.artifact !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["constructorParams"],
      message:
        "with --artifact the types come from its ABI; pass the values with --constructor-args",
    });
  }
  if (value.constructorSignature !== undefined && value.artifact !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["constructorSignature"],
      message: "--constructor-signature is not needed with --artifact; its ABI declares the types",
    });
  }
  if (
    value.constructorArgs !== undefined &&
    value.artifact === undefined &&
    value.constructorSignature === undefined &&
    value.abi === undefined
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["constructorArgs"],
      message:
        "--constructor-args needs the constructor's types: pass --artifact, or state them with --constructor-signature (--abi also declares them on TRON)",
    });
  }
}

const tronDeployFields = z.object({
  abi: z.string().min(1).optional().describe("contract ABI as a JSON array string"),
  feeLimit: Schemas.positiveIntString()
    .default(DEFAULT_FEE_LIMIT_SUN)
    .describe("maximum energy fee to burn, in SUN"),
  ...tronTxModeFields,
});

// TronWeb requires the full ABI; a constructor signature cannot replace it.
function tronDeployRefine(value: { constructorSignature?: string }, ctx: z.RefinementCtx): void {
  if (value.constructorSignature !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["constructorSignature"],
      message:
        "--constructor-signature has no effect on TRON: the node needs the full ABI, so pass --artifact or --abi",
    });
  }
}

export const contractDeploySpec: ChainSpec = {
  path: ["contract", "deploy"],
  network: "optional",
  wallet: "optional",
  auth: "conditional",
  broadcasts: true,
  capability: "contract.deploy",
  summary: "Deploy contract bytecode",
  description:
    "Deploy contract creation bytecode and report the new contract's address.\n" +
    "Flags marked (TRON only) or (EVM only) are accepted only on networks of that family; using one on the other family is rejected.",
  baseFields: deployFields,
  exclusive: [
    { label: "the creation bytecode", flags: ["artifact", "code", "code-file"] },
    {
      label: "the constructor values",
      flags: ["constructor-args", "constructor-params"],
      select: "at-most-one",
    },
    // --abi is a TRON field, so on EVM the group reduces to --artifact alone.
    { label: "the contract ABI on TRON", flags: ["abi", "artifact"] },
    txModeExclusive,
  ],
  baseRefine: deployRefine,
  examples: [
    {
      cmd: 'wallet-cli contract deploy --artifact ./build/contracts/Token.json --constructor-args \'["18","MyToken"]\' --network nile',
    },
    {
      cmd: 'wallet-cli contract deploy --artifact ./out/Token.sol/Token.json --constructor-args \'["18","MyToken"]\' --network sepolia',
    },
    {
      cmd: "wallet-cli contract deploy --code-file ./Token.bin --constructor-signature 'constructor(uint8,string)' --constructor-args '[\"18\",\"MyToken\"]' --network sepolia",
    },
  ],
  formatText: TextFormatters.txReceipt,
};

export const contractDeployTronBinding = (svc: TronContractService): FamilyBinding => ({
  fields: tronDeployFields,
  refine: tronDeployRefine,
  run: async (ctx, net, input) => {
    const source = await deploySource(input);
    let abi = source.abi;
    if (abi === undefined) {
      try {
        abi = JSON.parse(input.abi);
      } catch {
        throw new UsageError("invalid_value", "--abi must be valid JSON");
      }
    }
    return svc.deploy(ctx, net, {
      ...input,
      feeLimit: sunAmount(input.feeLimit),
      abi,
      bytecode: source.bytecode,
      // TronWeb takes bare values; their types come from the ABI.
      parameters: constructorValues(input),
    });
  },
});

const infoFields = z.object({
  contract: Schemas.addressFor("tron").describe("TRON contract address"),
});

export const contractInfoSpec: ChainSpec = {
  path: ["contract", "info"],
  network: "optional",
  wallet: "none",
  auth: "none",
  capability: "contract.call",
  summary: "Show contract ABI + metadata",
  baseFields: infoFields,
  examples: [{ cmd: "wallet-cli contract info --contract TR7..." }],
  formatText: TextFormatters.contractInfo,
};

export const contractInfoTronBinding = (svc: TronContractService): FamilyBinding => ({
  run: async (ctx, net, input) => svc.info(ctx.deadline, net, input.contract),
});

const contractGovernanceBase = {
  network: "optional" as const,
  wallet: "optional" as const,
  auth: "conditional" as const,
  broadcasts: true,
  capability: "contract.governance",
  exclusive: [txModeExclusive],
  baseRefine: tronExpirationRefine,
  formatText: TextFormatters.governanceReceipt,
};

const governedContract = Schemas.addressFor("tron").describe(
  "contract address; the selected account must be its deployer",
);

export const contractClearAbiSpec: ChainSpec = {
  path: ["contract", "clear-abi"],
  ...contractGovernanceBase,
  positionals: [{ field: "address" }],
  summary: "Clear a contract's on-chain ABI",
  description:
    "Clear the ABI metadata stored on-chain. This is irreversible, but does not change the\n" +
    "contract bytecode or state. Only the contract deployer may perform the operation.",
  requires: ["the contract deployer account"],
  baseFields: z.object({ address: governedContract, ...governanceTxModeFields }),
  examples: [{ cmd: "wallet-cli contract clear-abi TQ5... --wait" }],
};

export const contractClearAbiTronBinding = (svc: TronContractService): FamilyBinding => ({
  run: async (ctx, net, input) => svc.clearAbi(ctx, net, input),
});

export const contractSetOriginEnergyLimitSpec: ChainSpec = {
  path: ["contract", "set-origin-energy-limit"],
  ...contractGovernanceBase,
  positionals: [{ field: "address" }, { field: "energy" }],
  summary: "Set the deployer's energy cap",
  description:
    "Set origin_energy_limit, the maximum energy the deployer covers per call. The actual\n" +
    "contribution is also limited by the deployer's available staked energy.",
  requires: ["the contract deployer account"],
  baseFields: z.object({
    address: governedContract,
    energy: Schemas.positiveIntString()
      .refine(
        (value) => !/^\d+$/.test(value) || isZeroAmount(value) || isOriginEnergyLimit(value),
        "must not exceed signed int64 max",
      )
      .describe("deployer energy contribution limit; integer > 0"),
    ...governanceTxModeFields,
  }),
  examples: [{ cmd: "wallet-cli contract set-origin-energy-limit TQ5... 50000000 --wait" }],
};

export const contractSetOriginEnergyLimitTronBinding = (
  svc: TronContractService,
): FamilyBinding => ({
  run: async (ctx, net, input) => svc.setOriginEnergyLimit(ctx, net, input),
});

export const contractSetUserResourcePercentSpec: ChainSpec = {
  path: ["contract", "set-user-resource-percent"],
  ...contractGovernanceBase,
  positionals: [{ field: "address" }, { field: "percent" }],
  summary: "Set the caller-paid resource share",
  description:
    "Set consume_user_resource_percent. 100 means the caller pays all energy; 0 means the\n" +
    "deployer pays, subject to origin_energy_limit and available staked energy.",
  requires: ["the contract deployer account"],
  baseFields: z.object({
    address: governedContract,
    percent: z.coerce
      .number()
      .int()
      .min(0)
      .max(MAX_PERCENT)
      .describe(`percentage of energy paid by the caller (0-${MAX_PERCENT})`),
    ...governanceTxModeFields,
  }),
  examples: [{ cmd: "wallet-cli contract set-user-resource-percent TQ5... 100 --wait" }],
};

export const contractSetUserResourcePercentTronBinding = (
  svc: TronContractService,
): FamilyBinding => ({
  run: async (ctx, net, input) => svc.setUserResourcePercent(ctx, net, input),
});

export const contractCreate2Spec: ChainSpec = {
  path: ["contract", "create2"],
  network: "optional",
  wallet: "none",
  auth: "none",
  capability: "contract.create2",
  summary: "Precompute a CREATE2 address",
  description:
    "Compute the TRON CREATE2 address locally without contacting a node. code must be creation\n" +
    "bytecode with constructor arguments appended; salt is a signed decimal 64-bit integer.",
  baseFields: z.object({
    deployer: Schemas.addressFor("tron").describe("account or factory contract performing CREATE2"),
    code: z
      .string()
      .optional()
      .describe("creation bytecode as hex; whitespace and an optional 0x prefix are stripped"),
    codeFile: z.string().min(1).optional().describe("path containing creation bytecode hex"),
    salt: z
      .string()
      .regex(/^-?\d+$/)
      .describe("signed decimal 64-bit salt"),
  }),
  exclusive: [{ label: "the creation bytecode", flags: ["code", "code-file"] }],
  examples: [
    {
      cmd: "wallet-cli contract create2 --deployer TQk... --code-file ./Token.creation.hex --salt 1",
    },
    { cmd: "wallet-cli contract create2 --deployer TQk... --code 60806040 --salt 255" },
  ],
  formatText: TextFormatters.contractCreate2,
};

export const contractCreate2TronBinding = (svc: TronContractService): FamilyBinding => ({
  run: async (_ctx, _net, input) => {
    let code = input.code;
    if (input.codeFile) {
      try {
        code = await readFile(input.codeFile, "utf8");
      } catch (error) {
        const codeValue = (error as NodeJS.ErrnoException).code;
        if (codeValue === "ENOENT")
          throw new UsageError(
            "file_not_found",
            errorMessage`code file not found: ${input.codeFile}`,
          );
        throw new UsageError(
          "invalid_value",
          errorMessage`cannot read code file: ${input.codeFile}`,
        );
      }
    }
    return svc.create2(input.deployer, code!, input.salt);
  },
});
