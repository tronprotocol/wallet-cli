/**
 * TRON contract group (L4) — constant/state-changing calls, deploy, metadata.
 */
import { z } from "zod";
import type { CommandDefinition } from "../../core/types/index.js";
import { Schemas } from "../../infra/contract/index.js";
import { UsageError } from "../../core/errors/index.js";
import type { Services } from "../services.js";
import { txModeFields, txMode, outcomeData } from "../shared.js";
import { rpcOf } from "./shared.js";

/** parse a JSON --params array of {type,value} for trigger* calls. */
function parseParams(json?: string): any[] {
  if (!json) return [];
  let v: unknown;
  try {
    v = JSON.parse(json);
  } catch {
    throw new UsageError("invalid_value", "--params must be a JSON array");
  }
  if (!Array.isArray(v)) throw new UsageError("invalid_value", "--params must be a JSON array of {type,value}");
  return v;
}

function contractCall(): CommandDefinition {
  const fields = z.object({
    contract: Schemas.base58Address().describe("contract address"),
    method: z.string().min(1).describe("function signature, e.g. balanceOf(address)"),
    params: z.string().optional().describe("JSON array of {type,value}"),
  });
  return {
    id: "tron.contract.call", path: ["contract", "call"], family: "tron",
    network: "optional", wallet: "none", auth: "none", capability: "contract.call",
    summary: "read-only call (triggerConstantContract)", fields, input: fields,
    examples: [{ cmd: `wallet-cli tron contract call --network nile --contract TR7... --method "balanceOf(address)" --params '[{"type":"address","value":"T..."}]'` }],
    run: async (_ctx, net, input) => {
      const result = await rpcOf(net!).triggerConstantContract(input.contract, input.method, parseParams(input.params));
      return { contract: input.contract, method: input.method, result };
    },
  };
}

function contractSend(services: Services): CommandDefinition {
  const fields = z.object({
    contract: Schemas.base58Address().describe("contract address"),
    method: z.string().min(1).describe("function signature"),
    params: z.string().optional().describe("JSON array of {type,value}"),
    callValueSun: z.coerce.number().int().nonnegative().default(0).describe("TRX (SUN) sent with the call"),
    feeLimit: z.coerce.number().int().positive().default(100_000_000).describe("energy fee cap (SUN)"),
    ...txModeFields,
  });
  return {
    id: "tron.contract.send", path: ["contract", "send"], family: "tron",
    network: "required", wallet: "optional", auth: "required", capability: "contract.call",
    summary: "state-changing call (triggerSmartContract)", fields, input: fields,
    examples: [{ cmd: `wallet-cli tron contract send --network nile --contract TR7... --method "transfer(address,uint256)" --params '[...]'` }],
    run: async (ctx, net, input) => {
      const mode = txMode(input);
      const rpc = rpcOf(net!);
      const params = parseParams(input.params);
      const outcome = await services.txPipeline.run({
        ctx, net: net!, account: ctx.activeAccount, ...mode,
        build: (from) => rpc.triggerSmartContract(from, input.contract, input.method, params, { feeLimit: input.feeLimit, callValue: input.callValueSun }),
        estimate: () => rpc.estimateResources(ctx.resolveAddress("tron"), input.contract, input.method, params),
      });
      return outcomeData(outcome);
    },
  };
}

function contractDeploy(services: Services): CommandDefinition {
  const fields = z.object({
    abi: z.string().min(1).describe("contract ABI (JSON)"),
    bytecode: z.string().min(1).describe("contract bytecode (hex)"),
    feeLimit: z.coerce.number().int().positive().describe("energy fee cap (SUN)"),
    // NB: field must NOT be named `constructor` — it collides with Object.prototype.constructor
    // (yargs crashes on the option; argv.constructor reads the Object ctor fn). Flag = --constructor-sig.
    constructorSig: z.string().optional().describe("constructor signature"),
    params: z.string().optional().describe("constructor params (JSON array)"),
    ...txModeFields,
  });
  return {
    id: "tron.contract.deploy", path: ["contract", "deploy"], family: "tron",
    network: "required", wallet: "optional", auth: "required", capability: "contract.deploy",
    summary: "deploy a smart contract", fields, input: fields,
    examples: [{ cmd: "wallet-cli tron contract deploy --network nile --abi '[...]' --bytecode 60... --fee-limit 1000000000" }],
    run: async (ctx, net, input) => {
      const mode = txMode(input);
      const rpc = rpcOf(net!);
      let abi: unknown;
      try {
        abi = JSON.parse(input.abi);
      } catch {
        throw new UsageError("invalid_value", "--abi must be valid JSON");
      }
      const outcome = await services.txPipeline.run({
        ctx, net: net!, account: ctx.activeAccount, ...mode,
        build: (from) => rpc.deployContract(from, { abi, bytecode: input.bytecode, feeLimit: input.feeLimit, parameters: parseParams(input.params) }),
        estimate: async () => ({ feeModel: "tron-resource", note: "deploy energy depends on bytecode size" }),
      });
      return outcomeData(outcome);
    },
  };
}

function contractInfo(): CommandDefinition {
  const fields = z.object({ contract: Schemas.base58Address().describe("contract address") });
  return {
    id: "tron.contract.info", path: ["contract", "info"], family: "tron",
    network: "optional", wallet: "none", auth: "none", capability: "contract.call",
    summary: "contract ABI + metadata (getContract + getContractInfo)", fields, input: fields,
    examples: [{ cmd: "wallet-cli tron contract info --network nile --contract TR7..." }],
    run: async (_ctx, net, input) => {
      const rpc = rpcOf(net!);
      const [contract, info] = await Promise.all([
        rpc.getContract(input.contract),
        rpc.getContractInfo(input.contract).catch(() => undefined),
      ]);
      return { address: input.contract, contract, info };
    },
  };
}

export function contractCommands(services: Services): CommandDefinition[] {
  return [contractCall(), contractSend(services), contractDeploy(services), contractInfo()];
}
