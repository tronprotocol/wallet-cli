import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";
import { UsageError } from "../../../../domain/errors/index.js";
import type { TronContractService } from "../../../../application/use-cases/tron/contract-service.js";
import type { TronContractParameter } from "../../../../application/ports/chain/tron-gateway.js";
import { Schemas } from "../schemas/index.js";
import { txModeFields } from "./shared.js";
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
  ...txModeFields,
});

export const contractSendSpec: ChainSpec = {
  path: ["contract", "send"],
  network: "required", wallet: "optional", auth: "required",
  broadcasts: true,
  capability: "contract.call",
  summary: "State-changing call (triggerSmartContract)",
  baseFields: sendFields,
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
  ...txModeFields,
});

export const contractDeploySpec: ChainSpec = {
  path: ["contract", "deploy"],
  network: "required", wallet: "optional", auth: "required",
  broadcasts: true,
  capability: "contract.deploy",
  summary: "Deploy a smart contract",
  // The Ledger TRON app firmware rejects CreateSmartContract (APDU 0x6a80), even with
  // blind-signing enabled; software accounts sign and deploy it fine.
  requires: ["a software (non-Ledger) account — the Ledger TRON app cannot sign this transaction type"],
  baseFields: deployFields,
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
