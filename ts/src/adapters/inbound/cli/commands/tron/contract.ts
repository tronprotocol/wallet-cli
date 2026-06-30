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
    summary: "read-only call (triggerConstantContract)",
    fields,
    input: fields,
    examples: [{
      cmd: `wallet-cli contract call --network nile --contract TR7... --method "balanceOf(address)" --params '[{"type":"address","value":"T..."}]'`,
    }],
    formatText: TextFormatters.contractCall,
    run: async (_ctx, network, input) => service.call(
      network!, input.contract, input.method, jsonArray(input.params) as TronContractParameter[],
    ),
  };
}

function send(service: TronContractService): CommandDefinition {
  const fields = z.object({
    contract: Schemas.addressFor("tron").describe("TRON contract address"),
    method: z.string().min(1).describe("function signature, e.g. transfer(address,uint256)"),
    params: z.string().optional()
      .describe("JSON array of ABI parameters as {type,value}; omit to pass no parameters"),
    callValueSun: z.coerce.number().int().nonnegative().default(0)
      .describe("native TRX attached to the call, in SUN"),
    feeLimit: z.coerce.number().int().positive().default(100_000_000)
      .describe("maximum energy fee to burn, in SUN"),
    ...txModeFields,
  });
  return {
    path: ["contract", "send"], family: "tron",
    network: "required", wallet: "optional", auth: "required",
    broadcasts: true,
    capability: "contract.call",
    summary: "state-changing call (triggerSmartContract)",
    fields,
    input: fields,
    examples: [{
      cmd: `wallet-cli contract send --network nile --contract TR7... --method "transfer(address,uint256)" --params '[...]'`,
    }],
    formatText: TextFormatters.txReceipt,
    run: async (ctx, network, input) => service.send(ctx, network!, {
      ...input,
      parameters: jsonArray(input.params) as TronContractParameter[],
    }),
  };
}

function deploy(service: TronContractService): CommandDefinition {
  const fields = z.object({
    abi: z.string().min(1).describe("contract ABI as a JSON array string"),
    bytecode: z.string().min(1).describe("compiled contract bytecode as hex, 0x-prefixed or bare"),
    feeLimit: z.coerce.number().int().positive().describe("maximum energy fee to burn, in SUN"),
    constructorSig: z.string().optional()
      .describe("constructor signature, e.g. constructor(uint256); omit when the contract has no constructor args"),
    params: z.string().optional()
      .describe("constructor args as a JSON array of {type,value}; omit to pass no constructor args"),
    ...txModeFields,
  });
  return {
    path: ["contract", "deploy"], family: "tron",
    network: "required", wallet: "optional", auth: "required",
    broadcasts: true,
    capability: "contract.deploy",
    summary: "deploy a smart contract",
    fields,
    input: fields,
    examples: [{
      cmd: "wallet-cli contract deploy --network nile --abi '[...]' --bytecode 60... --fee-limit 1000000000",
    }],
    formatText: TextFormatters.txReceipt,
    run: async (ctx, network, input) => {
      let abi: unknown;
      try {
        abi = JSON.parse(input.abi);
      } catch {
        throw new UsageError("invalid_value", "--abi must be valid JSON");
      }
      return service.deploy(ctx, network!, {
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
    summary: "contract ABI + metadata (getContract + getContractInfo)",
    fields,
    input: fields,
    examples: [{ cmd: "wallet-cli contract info --network nile --contract TR7..." }],
    formatText: TextFormatters.contractInfo,
    run: async (_ctx, network, input) => service.info(network!, input.contract),
  };
}
