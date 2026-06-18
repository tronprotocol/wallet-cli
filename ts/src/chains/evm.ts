/**
 * EvmModule (L4) — EVM's own command surface. EVM-specific build/estimate (viem prepare,
 * EIP-1559 fee) live here; only infra is shared. Implements the ChainModule contract
 * (plan §3 L4 / §5). EVM-only commands (typed-data sign, deploy, legacy gas…) will be added here.
 */
import { z } from "zod";
import type {
  CapabilityDescriptor,
  ChainModule,
  CommandDefinition,
  CommandRegistryLike,
  NetworkDescriptor,
} from "../core/types/index.js";
import { Schemas } from "../infra/contract/index.js";
import { BUILTIN_NETWORKS } from "../infra/config/builtins.js";
import { EvmRpcClient } from "../infra/rpc/index.js";
import type { Services } from "./services.js";
import { balanceCommand, messageSignCommand, txModeFields, txMode, outcomeData } from "./shared.js";

export class EvmModule implements ChainModule {
  readonly family = "evm" as const;
  constructor(private readonly services: Services) {}

  networks(): NetworkDescriptor[] {
    return Object.values(BUILTIN_NETWORKS).filter((n) => n.family === "evm");
  }

  // command-backed capabilities only (single source of truth — must match a registered command).
  // network-specific traits like fee.eip1559 live on the NetworkDescriptor, not here.
  capabilities(): CapabilityDescriptor[] {
    return [
      { key: "account.balance.native", summary: "native ETH/wei balance" },
      { key: "tx.native.transfer", summary: "transfer native coin (wei)" },
      { key: "tx.token.transfer", summary: "transfer ERC-20" },
      { key: "tx.estimate", summary: "gas/fee estimate (dry-run)" },
      { key: "message.sign", summary: "personal_sign a message" },
    ];
  }

  registerCommands(reg: CommandRegistryLike): void {
    reg.add(balanceCommand("evm"));
    reg.add(this.#sendNative());
    reg.add(this.#sendToken());
    reg.add(this.#txStatus());
    reg.add(this.#txInfo());
    reg.add(messageSignCommand("evm", this.services));
  }

  // ── ERC-20 transfer (shared intent w/ TRON, but EVM units/fees) ──
  #sendToken(): CommandDefinition {
    const services = this.services;
    const fields = z.object({
      to: Schemas.evmAddress().describe("recipient EVM address"),
      amountWei: Schemas.uintString().describe("amount in the token's smallest unit"),
      contract: Schemas.evmAddress().describe("ERC-20 contract address"),
      maxFee: Schemas.uintString().optional().describe("EIP-1559 maxFeePerGas (wei)"),
      maxPriorityFee: Schemas.uintString().optional().describe("EIP-1559 maxPriorityFeePerGas (wei)"),
      gasPrice: Schemas.uintString().optional().describe("legacy gas price (wei)"),
      ...txModeFields,
    });
    return {
      id: "evm.tx.send-token", path: ["tx", "send-token"], family: "evm",
      network: "required", wallet: "required", auth: "required", capability: "tx.token.transfer",
      summary: "transfer an ERC-20 token", fields, input: fields,
      examples: [{ cmd: "wallet-cli evm tx send-token --network base --contract 0x... --to 0x... --amount-wei 1000000 --broadcast" }],
      run: async (ctx, net, input) => {
        const mode = txMode(input);
        const rpc = net!.rpc as EvmRpcClient;
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

  #txStatus(): CommandDefinition {
    const fields = z.object({ txid: z.string().min(1).describe("transaction hash") });
    return {
      id: "evm.tx.status", path: ["tx", "status"], family: "evm",
      network: "optional", wallet: "none", auth: "none",
      summary: "confirmation status of a transaction", fields, input: fields,
      examples: [{ cmd: "wallet-cli evm tx status --network base --txid 0x..." }],
      run: async (_ctx, net, input) => {
        const receipt = await (net!.rpc as EvmRpcClient).getTransactionReceipt(input.txid);
        return {
          txid: input.txid,
          confirmed: !!receipt,
          blockNumber: receipt?.blockNumber !== undefined ? receipt.blockNumber.toString() : undefined,
          status: receipt?.status,
        };
      },
    };
  }

  #txInfo(): CommandDefinition {
    const fields = z.object({ txid: z.string().min(1).describe("transaction hash") });
    return {
      id: "evm.tx.info", path: ["tx", "info"], family: "evm",
      network: "optional", wallet: "none", auth: "none",
      summary: "full transaction detail + receipt", fields, input: fields,
      examples: [{ cmd: "wallet-cli evm tx info --network base --txid 0x..." }],
      run: async (_ctx, net, input) => {
        const rpc = net!.rpc as EvmRpcClient;
        const [transaction, receipt] = await Promise.all([rpc.getTransaction(input.txid), rpc.getTransactionReceipt(input.txid)]);
        return { txid: input.txid, transaction, receipt };
      },
    };
  }

  // ── EVM-specific: native wei transfer through the shared TxPipeline ──
  #sendNative(): CommandDefinition {
    const services = this.services;
    const fields = z.object({
      to: Schemas.evmAddress().describe("recipient EVM address"),
      amountWei: Schemas.uintString().describe("amount in wei"),
      dryRun: z.boolean().default(false).describe("build + estimate only, do not sign"),
      broadcast: z.boolean().default(false).describe("broadcast after signing"),
    });
    return {
      id: "evm.tx.send-native",
      path: ["tx", "send-native"],
      family: "evm",
      network: "required",
      wallet: "required",
      auth: "required",
      capability: "tx.native.transfer",
      summary: "transfer native wei",
      fields,
      input: fields,
      examples: [{ cmd: "wallet-cli evm tx send-native --network base --to 0x... --amount-wei 1000000 --dry-run" }],
      run: async (ctx, net, input) =>
        services.txPipeline.run({
          ctx,
          net: net!,
          account: ctx.activeAccount,
          // reuse the shared mode resolver for its conflict guard (--dry-run + --broadcast → usage error).
          ...txMode({ dryRun: input.dryRun, broadcast: input.broadcast }),
          build: (from) => (net!.rpc as EvmRpcClient).prepareNativeTransfer(from, input.to, input.amountWei),
          estimate: async (tx: any) => {
            const gas = BigInt(tx.gas ?? 21000n);
            const price = BigInt(tx.maxFeePerGas ?? tx.gasPrice ?? 0n);
            return { feeWei: (gas * price).toString(), gas: gas.toString(), feeModel: net!.feeModel };
          },
        }),
    };
  }
}
