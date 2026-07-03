import { z } from "zod";
import type { CommandDefinition } from "../../contracts/index.js";
import { UsageError } from "../../../../../domain/errors/index.js";
import type { TronContractService } from "../../../../../application/use-cases/tron/contract-service.js";
import type { TronContractParameter } from "../../../../../application/ports/chain/tron-gateway.js";
import { Schemas } from "../../schemas/index.js";
import { txModeFields } from "../shared.js";
import { TextFormatters } from "../../render/index.js";

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

export function contractCommands(service: TronContractService): CommandDefinition[] {
  return [call(service), send(service), deploy(service), info(service)];
}

function call(service: TronContractService): CommandDefinition {
  const fields = z.object({
    contract: Schemas.addressFor("tron").describe("TRON contract address"),
    method: z.string().min(1).describe("function signature, e.g. balanceOf(address)"),
    params: z.string().optional()
      .describe("JSON array of ABI parameters as {type,value}; omit to pass no parameters"),
  });
  return {
    path: ["contract", "call"], family: "tron",
    network: "optional", wallet: "none", auth: "none",
    capability: "contract.call",
    summary: "Read-only call (triggerConstantContract)",
    fields,
    input: fields,
    examples: [{
      cmd: `wallet-cli contract call --contract TR7... --method "balanceOf(address)" --params '[{"type":"address","value":"T..."}]'`,
    }],
    formatText: TextFormatters.contractCall,
    run: async (_ctx, network, input) => service.call(
      network, input.contract, input.method, typedParams(input.params),
    ),
  };
}

function send(service: TronContractService): CommandDefinition {
  const fields = z.object({
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
  return {
    path: ["contract", "send"], family: "tron",
    network: "required", wallet: "optional", auth: "required",
    broadcasts: true,
    capability: "contract.call",
    summary: "State-changing call (triggerSmartContract)",
    fields,
    input: fields,
    examples: [{
      cmd: `wallet-cli contract send --contract TR7... --method "transfer(address,uint256)" --params '[...]'`,
    }],
    formatText: TextFormatters.txReceipt,
    run: async (ctx, network, input) => service.send(ctx, network, {
      ...input,
      parameters: typedParams(input.params),
    }),
  };
}

function deploy(service: TronContractService): CommandDefinition {
  const fields = z.object({
    abi: z.string().min(1).describe("contract ABI as a JSON array string"),
    bytecode: z.string().min(1).describe("compiled contract bytecode as hex, 0x-prefixed or bare"),
    feeLimit: Schemas.positiveIntString().describe("maximum energy fee to burn, in SUN"),
    params: z.string().optional()
      .describe("constructor args as a JSON array of raw positional values, e.g. [100, \"T...\"]; types are taken from the ABI constructor; omit to pass no constructor args"),
    ...txModeFields,
  });
  return {
    path: ["contract", "deploy"], family: "tron",
    network: "required", wallet: "optional", auth: "required",
    broadcasts: true,
    capability: "contract.deploy",
    summary: "Deploy a smart contract",
    // The Ledger TRON app firmware rejects CreateSmartContract (APDU 0x6a80), even with
    // blind-signing enabled; software accounts sign and deploy it fine.
    requires: ["a software (non-Ledger) account — the Ledger TRON app cannot sign this transaction type"],
    fields,
    input: fields,
    examples: [{
      cmd: "wallet-cli contract deploy --abi '[...]' --bytecode 60... --fee-limit 1000000000 --params '[100, \"T...\"]'",
    }],
    formatText: TextFormatters.txReceipt,
    run: async (ctx, network, input) => {
      let abi: unknown;
      try {
        abi = JSON.parse(input.abi);
      } catch {
        throw new UsageError("invalid_value", "--abi must be valid JSON");
      }
      return service.deploy(ctx, network, {
        ...input,
        abi,
        parameters: jsonArray(input.params),
      });
    },
  };
}

function info(service: TronContractService): CommandDefinition {
  const fields = z.object({
    contract: Schemas.addressFor("tron").describe("TRON contract address"),
  });
  return {
    path: ["contract", "info"], family: "tron",
    network: "optional", wallet: "none", auth: "none",
    capability: "contract.call",
    summary: "Show contract ABI + metadata",
    fields,
    input: fields,
    examples: [{ cmd: "wallet-cli contract info --contract TR7..." }],
    formatText: TextFormatters.contractInfo,
    run: async (_ctx, network, input) => service.info(network, input.contract),
  };
}
