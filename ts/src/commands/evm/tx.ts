/**
 * EVM tx group (L4) — native/ERC-20 transfers + status/info. EVM-specific build/estimate
 * (viem prepare, EIP-1559 fee) live here; only infra is shared.
 */
import { z } from "zod";
import type { CommandDefinition, NetworkDescriptor } from "../../core/types/index.js";
import { Schemas } from "../../infra/contract/index.js";
import { EvmRpcClient } from "../../infra/rpc/index.js";
import type { Services } from "../services.js";
import { txModeFields, txMode, outcomeData } from "../shared.js";

const rpcOf = (net: NetworkDescriptor): EvmRpcClient => net.rpc as EvmRpcClient;

function sendNative(services: Services): CommandDefinition {
  const fields = z.object({
    to: Schemas.evmAddress().describe("recipient EVM address"),
    amountWei: Schemas.uintString().describe("native amount as a non-negative integer string, in wei (1 ETH/BNB/etc = 1e18 wei on standard EVM chains)"),
    ...txModeFields,
  });
  return {
    id: "evm.tx.send-native", path: ["tx", "send-native"], family: "evm",
    network: "required", wallet: "optional", auth: "required", capability: "tx.native.transfer",
    summary: "transfer native wei", fields, input: fields,
    examples: [{ cmd: "wallet-cli evm tx send-native --network base --to 0x... --amount-wei 1000000 --dry-run" }],
    run: async (ctx, net, input) =>
      services.txPipeline.run({
        ctx, net: net!, account: ctx.activeAccount,
        ...txMode(input),
        build: (from) => rpcOf(net!).prepareNativeTransfer(from, input.to, input.amountWei),
        estimate: async (tx: any) => {
          const gas = BigInt(tx.gas ?? 21000n);
          const price = BigInt(tx.maxFeePerGas ?? tx.gasPrice ?? 0n);
          return { feeWei: (gas * price).toString(), gas: gas.toString(), feeModel: net!.feeModel };
        },
      }),
  };
}

function sendToken(services: Services): CommandDefinition {
  const fields = z.object({
    to: Schemas.evmAddress().describe("recipient EVM address"),
    amountWei: Schemas.uintString().describe("ERC-20 amount as a raw non-negative integer string in the token's smallest unit; flag name is amount-wei for CLI compatibility"),
    contract: Schemas.evmAddress().describe("ERC-20 contract address"),
    maxFee: Schemas.uintString().optional().describe("EIP-1559 maxFeePerGas override, in wei; omit to auto-estimate"),
    maxPriorityFee: Schemas.uintString().optional().describe("EIP-1559 maxPriorityFeePerGas tip override, in wei; omit to auto-estimate"),
    gasPrice: Schemas.uintString().optional().describe("legacy gas price override, in wei; use on non-EIP-1559 chains instead of --max-fee/--max-priority-fee"),
    ...txModeFields,
  });
  return {
    id: "evm.tx.send-token", path: ["tx", "send-token"], family: "evm",
    network: "required", wallet: "optional", auth: "required", capability: "tx.token.transfer",
    summary: "transfer an ERC-20 token", fields, input: fields,
    examples: [{ cmd: "wallet-cli evm tx send-token --network base --contract 0x... --to 0x... --amount-wei 1000000" }],
    run: async (ctx, net, input) => {
      const mode = txMode(input);
      const rpc = rpcOf(net!);
      const outcome = await services.txPipeline.run({
        ctx, net: net!, account: ctx.activeAccount, ...mode,
        build: (from) =>
          rpc.prepareErc20Transfer(from, input.contract, input.to, input.amountWei, {
            maxFeePerGas: input.maxFee, maxPriorityFeePerGas: input.maxPriorityFee, gasPrice: input.gasPrice,
          }),
        estimate: async (tx: any) => {
          const gas = BigInt(tx.gas ?? 0n);
          const price = BigInt(tx.maxFeePerGas ?? tx.gasPrice ?? 0n);
          return { feeWei: (gas * price).toString(), gas: gas.toString(), feeModel: net!.feeModel };
        },
      });
      return outcomeData(outcome);
    },
  };
}

function txStatus(): CommandDefinition {
  const fields = z.object({ txid: z.string().min(1).describe("EVM transaction hash, 0x-prefixed") });
  return {
    id: "evm.tx.status", path: ["tx", "status"], family: "evm",
    network: "optional", wallet: "none", auth: "none",
    summary: "confirmation status of a transaction", fields, input: fields,
    examples: [{ cmd: "wallet-cli evm tx status --network base --txid 0x..." }],
    run: async (_ctx, net, input) => {
      const receipt = await rpcOf(net!).getTransactionReceipt(input.txid);
      return {
        txid: input.txid,
        confirmed: !!receipt,
        blockNumber: receipt?.blockNumber !== undefined ? receipt.blockNumber.toString() : undefined,
        status: receipt?.status,
      };
    },
  };
}

function txInfo(): CommandDefinition {
  const fields = z.object({ txid: z.string().min(1).describe("EVM transaction hash, 0x-prefixed") });
  return {
    id: "evm.tx.info", path: ["tx", "info"], family: "evm",
    network: "optional", wallet: "none", auth: "none",
    summary: "full transaction detail + receipt", fields, input: fields,
    examples: [{ cmd: "wallet-cli evm tx info --network base --txid 0x..." }],
    run: async (_ctx, net, input) => {
      const rpc = rpcOf(net!);
      const [transaction, receipt] = await Promise.all([rpc.getTransaction(input.txid), rpc.getTransactionReceipt(input.txid)]);
      return { txid: input.txid, transaction, receipt };
    },
  };
}

export function txCommands(services: Services): CommandDefinition[] {
  return [sendNative(services), sendToken(services), txStatus(), txInfo()];
}
