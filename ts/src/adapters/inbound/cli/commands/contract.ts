import { z } from "zod";
import { readFile } from "node:fs/promises";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";
import { UsageError } from "../../../../domain/errors/index.js";
import type { TronContractService } from "../../../../application/use-cases/tron/contract-service.js";
import type { TronContractParameter } from "../../../../application/ports/chain/tron-gateway.js";
import { Schemas } from "../schemas/index.js";
import { governanceTxModeFields, governanceTxRefine } from "./shared.js";
import { TextFormatters } from "../render/index.js";

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

// call/send parameters are ABI-encoded from {type, value} entries. Validate the shape at the
// command boundary so a malformed entry fails as invalid_value here, not as an opaque encoder/RPC
// error deep in TronWeb. (deploy params are raw positional values — they use jsonArray, not this.)
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

const callFields = z.object({
  contract: Schemas.addressFor("tron").describe("TRON contract address"),
  method: z.string().min(1).describe("function signature, e.g. balanceOf(address)"),
  params: z.string().optional()
    .describe("JSON array of ABI parameters as {type,value}; omit to pass no parameters"),
});

export const contractCallSpec: ChainSpec = {
  path: ["contract", "call"],
  network: "optional", wallet: "none", auth: "none",
  capability: "contract.call",
  summary: "Read-only call (triggerConstantContract)",
  baseFields: callFields,
  examples: [{
    cmd: `wallet-cli contract call --contract TR7... --method "balanceOf(address)" --params '[{"type":"address","value":"T..."}]'`,
  }],
  formatText: TextFormatters.contractCall,
};

export const contractCallTronBinding = (svc: TronContractService): FamilyBinding => ({
  run: async (_ctx, net, input) => svc.call(
    net, input.contract, input.method, typedParams(input.params),
  ),
});

const sendFields = z.object({
  contract: Schemas.addressFor("tron").describe("TRON contract address"),
  method: z.string().min(1).describe("function signature, e.g. transfer(address,uint256)"),
  params: z.string().optional()
    .describe("JSON array of ABI parameters as {type,value}; omit to pass no parameters"),
  callValueSun: Schemas.uintString().default("0")
    .describe("native TRX attached to the call, in SUN"),
  feeLimit: Schemas.positiveIntString().default("100000000")
    .describe("maximum energy fee to burn, in SUN"),
  ...governanceTxModeFields,
});

export const contractSendSpec: ChainSpec = {
  path: ["contract", "send"],
  network: "optional", wallet: "optional", auth: "required",
  broadcasts: true,
  capability: "contract.call",
  summary: "State-changing call (triggerSmartContract)",
  baseFields: sendFields,
  baseRefine: governanceTxRefine,
  examples: [{
    cmd: `wallet-cli contract send --contract TR7... --method "transfer(address,uint256)" --params '[...]'`,
  }],
  formatText: TextFormatters.txReceipt,
};

export const contractSendTronBinding = (svc: TronContractService): FamilyBinding => ({
  run: async (ctx, net, input) => svc.send(ctx, net, {
    ...input,
    parameters: typedParams(input.params),
  }),
});

const deployFields = z.object({
  abi: z.string().min(1).describe("contract ABI as a JSON array string"),
  bytecode: z.string().min(1).describe("compiled contract bytecode as hex, 0x-prefixed or bare"),
  feeLimit: Schemas.positiveIntString().describe("maximum energy fee to burn, in SUN"),
  params: z.string().optional()
    .describe("constructor args as a JSON array of raw positional values, e.g. [100, \"T...\"]; types are taken from the ABI constructor; omit to pass no constructor args"),
  ...governanceTxModeFields,
});

export const contractDeploySpec: ChainSpec = {
  path: ["contract", "deploy"],
  network: "optional", wallet: "optional", auth: "required",
  broadcasts: true,
  capability: "contract.deploy",
  summary: "Deploy a smart contract",
  // The Ledger TRON app firmware rejects CreateSmartContract (APDU 0x6a80), even with
  // blind-signing enabled; software accounts sign and deploy it fine.
  requires: ["a software (non-Ledger) account — the Ledger TRON app cannot sign this transaction type"],
  baseFields: deployFields,
  baseRefine: governanceTxRefine,
  examples: [{
    cmd: "wallet-cli contract deploy --abi '[...]' --bytecode 60... --fee-limit 1000000000 --params '[100, \"T...\"]'",
  }],
  formatText: TextFormatters.txReceipt,
};

export const contractDeployTronBinding = (svc: TronContractService): FamilyBinding => ({
  run: async (ctx, net, input) => {
    let abi: unknown;
    try {
      abi = JSON.parse(input.abi);
    } catch {
      throw new UsageError("invalid_value", "--abi must be valid JSON");
    }
    return svc.deploy(ctx, net, {
      ...input,
      abi,
      parameters: jsonArray(input.params),
    });
  },
});

const infoFields = z.object({
  contract: Schemas.addressFor("tron").describe("TRON contract address"),
});

export const contractInfoSpec: ChainSpec = {
  path: ["contract", "info"],
  network: "optional", wallet: "none", auth: "none",
  capability: "contract.call",
  summary: "Show contract ABI + metadata",
  baseFields: infoFields,
  examples: [{ cmd: "wallet-cli contract info --contract TR7..." }],
  formatText: TextFormatters.contractInfo,
};

export const contractInfoTronBinding = (svc: TronContractService): FamilyBinding => ({
  run: async (_ctx, net, input) => svc.info(net, input.contract),
});

const contractGovernanceBase = {
  network: "optional" as const,
  wallet: "optional" as const,
  auth: "required" as const,
  broadcasts: true,
  capability: "contract.governance",
  baseRefine: governanceTxRefine,
  formatText: TextFormatters.governanceReceipt,
};

const governedContract = Schemas.addressFor("tron").describe("contract address; the selected account must be its deployer");

export const contractClearAbiSpec: ChainSpec = {
  path: ["contract", "clear-abi"],
  ...contractGovernanceBase,
  positionals: [{ field: "address" }],
  summary: "Irreversibly clear a contract's on-chain ABI",
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
  summary: "Set the deployer's per-call energy contribution cap",
  description:
    "Set origin_energy_limit, the maximum energy the deployer covers per call. The actual\n" +
    "contribution is also limited by the deployer's available staked energy.",
  requires: ["the contract deployer account"],
  baseFields: z.object({
    address: governedContract,
    energy: Schemas.positiveIntString()
      .refine(
        (value) => !/^\d+$/.test(value) || BigInt(value) <= (1n << 63n) - 1n,
        "must not exceed signed int64 max",
      )
      .describe("deployer energy contribution limit; integer > 0"),
    ...governanceTxModeFields,
  }),
  examples: [{ cmd: "wallet-cli contract set-origin-energy-limit TQ5... 50000000 --wait" }],
};

export const contractSetOriginEnergyLimitTronBinding = (svc: TronContractService): FamilyBinding => ({
  run: async (ctx, net, input) => svc.setOriginEnergyLimit(ctx, net, input),
});

export const contractSetUserResourcePercentSpec: ChainSpec = {
  path: ["contract", "set-user-resource-percent"],
  ...contractGovernanceBase,
  positionals: [{ field: "address" }, { field: "percent" }],
  summary: "Set the caller-paid energy percentage",
  description:
    "Set consume_user_resource_percent. 100 means the caller pays all energy; 0 means the\n" +
    "deployer pays, subject to origin_energy_limit and available staked energy.",
  requires: ["the contract deployer account"],
  baseFields: z.object({
    address: governedContract,
    percent: z.coerce.number().int().min(0).max(100)
      .describe("percentage of energy paid by the caller (0-100)"),
    ...governanceTxModeFields,
  }),
  examples: [{ cmd: "wallet-cli contract set-user-resource-percent TQ5... 100 --wait" }],
};

export const contractSetUserResourcePercentTronBinding = (svc: TronContractService): FamilyBinding => ({
  run: async (ctx, net, input) => svc.setUserResourcePercent(ctx, net, input),
});

function create2Refine(value: { code?: string; codeFile?: string }, ctx: z.RefinementCtx): void {
  if ([value.code !== undefined, value.codeFile !== undefined].filter(Boolean).length !== 1) {
    ctx.addIssue({ code: "custom", message: "provide exactly one of --code or --code-file" });
  }
}

export const contractCreate2Spec: ChainSpec = {
  path: ["contract", "create2"],
  network: "optional", wallet: "none", auth: "none",
  capability: "contract.create2",
  summary: "Compute a TVM CREATE2 contract address locally",
  description:
    "Compute the TRON CREATE2 address locally without contacting a node. code must be creation\n" +
    "bytecode with constructor arguments appended; salt is a signed decimal 64-bit integer.",
  baseFields: z.object({
    deployer: Schemas.addressFor("tron").describe("account or factory contract performing CREATE2"),
    code: z.string().optional().describe("creation bytecode as hex; whitespace and an optional 0x prefix are stripped"),
    codeFile: z.string().min(1).optional().describe("path containing creation bytecode hex"),
    salt: z.string().regex(/^-?\d+$/).describe("signed decimal 64-bit salt"),
  }),
  baseRefine: create2Refine,
  examples: [
    { cmd: "wallet-cli contract create2 --deployer TQk... --code-file ./Token.creation.hex --salt 1" },
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
        if (codeValue === "ENOENT") throw new UsageError("file_not_found", `code file not found: ${input.codeFile}`);
        throw new UsageError("invalid_value", `cannot read code file: ${input.codeFile}`);
      }
    }
    return svc.create2(input.deployer, code!, input.salt);
  },
});
