/**
 * TronModule (L4) — TRON's own command surface (plan §3 L4 / §5; spec §3). No universal
 * provider: TRON-specific build/estimate/codecs live here; only infra (TxPipeline,
 * SignerResolver, RpcClient) is shared. Implements the ChainModule contract.
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
import { TronRpcClient } from "../infra/rpc/index.js";
import type { Services } from "./services.js";
import { balanceCommand, messageSignCommand, txModeFields, txMode, outcomeData } from "./shared.js";
import { ExecutionError, UsageError } from "../core/errors/index.js";

const rpcOf = (net: NetworkDescriptor) => net.rpc as TronRpcClient;

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

/** --contract (TRC20) XOR --asset-id (TRC10); exactly one required. */
function tokenSelector(v: { contract?: string; assetId?: string }, ctx: z.RefinementCtx): void {
  const n = [v.contract !== undefined, v.assetId !== undefined].filter(Boolean).length;
  if (n !== 1) {
    ctx.addIssue({ code: "custom", path: ["contract"], message: "exactly one of --contract (TRC20) or --asset-id (TRC10) is required" });
  }
}

/** account resources view absorbing can-withdraw / available-unfreeze-count (spec §3.1). */
function mapResources(res: any, acct: any): Record<string, unknown> {
  const num = (x: unknown) => Number(x ?? 0);
  const bandwidth = {
    used: num(res?.NetUsed) + num(res?.freeNetUsed),
    limit: num(res?.NetLimit) + num(res?.freeNetLimit),
  };
  const energy = { used: num(res?.EnergyUsed), limit: num(res?.EnergyLimit) };
  const nowMs = Date.now();
  const unfreezing = (acct?.unfrozenV2 ?? []).map((u: any) => ({
    amountSun: String(u.unfreeze_amount ?? 0),
    expireTime: u.unfreeze_expire_time,
  }));
  const withdrawableSun = unfreezing
    .filter((u: any) => typeof u.expireTime === "number" && u.expireTime <= nowMs)
    .reduce((s: bigint, u: any) => s + BigInt(u.amountSun), 0n)
    .toString();
  return {
    bandwidth,
    energy,
    frozenV2: acct?.frozenV2 ?? [],
    unfreezing,
    withdrawableSun,
    // protocol caps concurrent unstakes at 32; remaining slots = 32 − pending.
    availableUnfreezeCount: Math.max(0, 32 - unfreezing.length),
  };
}

export class TronModule implements ChainModule {
  readonly family = "tron" as const;
  constructor(private readonly services: Services) {}

  networks(): NetworkDescriptor[] {
    return Object.values(BUILTIN_NETWORKS).filter((n) => n.family === "tron");
  }

  capabilities(): CapabilityDescriptor[] {
    return [
      { key: "account.balance.native", summary: "native TRX/SUN balance" },
      { key: "account.balance.token", summary: "TRC10/TRC20 token balance" },
      { key: "tx.native.transfer", summary: "transfer TRX (SUN)" },
      { key: "tx.token.transfer", summary: "transfer TRC10/TRC20" },
      { key: "tx.estimate", summary: "energy/bandwidth fee estimate" },
      { key: "tx.broadcast", summary: "broadcast a presigned transaction" },
      { key: "message.sign", summary: "sign a message (TIP-191/V2)" },
      { key: "contract.call", summary: "constant + state-changing contract calls" },
      { key: "contract.deploy", summary: "deploy a smart contract" },
      { key: "resources.energy", summary: "energy resource queries" },
      { key: "resources.bandwidth", summary: "bandwidth resource queries" },
      { key: "staking.freeze", summary: "freeze/unfreeze (Stake 2.0)" },
    ];
  }

  registerCommands(reg: CommandRegistryLike): void {
    // account
    reg.add(balanceCommand("tron"));
    reg.add(this.#accountResources());
    reg.add(this.#accountAssets());
    reg.add(this.#accountInfo());
    reg.add(this.#accountHistory());
    // token
    reg.add(this.#tokenBalance());
    reg.add(this.#tokenInfo());
    // tx
    reg.add(this.#sendNative());
    reg.add(this.#sendToken());
    reg.add(this.#broadcast());
    reg.add(this.#txStatus());
    reg.add(this.#txInfo());
    // resource
    reg.add(this.#freeze());
    reg.add(this.#unfreeze());
    reg.add(this.#withdraw());
    reg.add(this.#cancelUnfreeze());
    reg.add(this.#prices());
    // block
    reg.add(this.#blockGet());
    // contract
    reg.add(this.#contractCall());
    reg.add(this.#contractSend());
    reg.add(this.#contractDeploy());
    reg.add(this.#contractInfo());
    // message
    reg.add(messageSignCommand("tron", this.services));
  }

  // ── account ─────────────────────────────────────────────────────────────────
  #accountResources(): CommandDefinition {
    const fields = z.object({ address: Schemas.base58Address().optional().describe("target (default: active)") });
    return {
      id: "tron.account.resources", path: ["account", "resources"], family: "tron",
      network: "optional", wallet: "optional", auth: "none", capability: "resources.bandwidth",
      summary: "bandwidth/energy + staking (frozen, unfreezing, withdrawable)", fields, input: fields,
      examples: [{ cmd: "wallet-cli tron account resources --network nile" }],
      run: async (ctx, net, input) => {
        const address = input.address ?? ctx.resolveAddress("tron");
        const rpc = rpcOf(net!);
        const [res, acct] = await Promise.all([rpc.getAccountResources(address), rpc.getAccount(address)]);
        return { address, ...mapResources(res, acct) };
      },
    };
  }

  #accountAssets(): CommandDefinition {
    const fields = z.object({
      address: Schemas.base58Address().optional().describe("target (default: active)"),
      tokens: z.string().optional().describe("comma-separated TRC20 contracts / TRC10 asset-ids"),
    });
    return {
      id: "tron.account.assets", path: ["account", "assets"], family: "tron",
      network: "optional", wallet: "optional", auth: "none", capability: "account.balance.token",
      summary: "per-token balances (no indexer needed)", fields, input: fields,
      examples: [{ cmd: "wallet-cli tron account assets --network nile --tokens TR7...,1002000" }],
      run: async (ctx, net, input) => {
        const address = input.address ?? ctx.resolveAddress("tron");
        const rpc = rpcOf(net!);
        const ids = (input.tokens ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
        const assets = await Promise.all(
          ids.map(async (id: string) => {
            const isTrc10 = /^\d+$/.test(id);
            const balance = isTrc10 ? await rpc.getTrc10Balance(id, address) : await rpc.getTrc20Balance(id, address);
            return { token: id, kind: isTrc10 ? "trc10" : "trc20", balance };
          }),
        );
        return { address, assets };
      },
    };
  }

  #accountInfo(): CommandDefinition {
    const fields = z.object({ address: Schemas.base58Address().optional().describe("target (default: active)") });
    return {
      id: "tron.account.info", path: ["account", "info"], family: "tron",
      network: "optional", wallet: "optional", auth: "none",
      summary: "raw account (getAccount passthrough)", fields, input: fields,
      examples: [{ cmd: "wallet-cli tron account info --network nile" }],
      run: async (ctx, net, input) => {
        const address = input.address ?? ctx.resolveAddress("tron");
        return { address, account: await rpcOf(net!).getAccount(address) };
      },
    };
  }

  #accountHistory(): CommandDefinition {
    const fields = z.object({
      address: Schemas.base58Address().optional().describe("target (default: active)"),
      limit: z.coerce.number().int().positive().max(200).default(20).describe("max records (default 20)"),
      only: z.enum(["native", "token"]).optional().describe("filter by transfer type"),
    });
    return {
      id: "tron.account.history", path: ["account", "history"], family: "tron",
      network: "optional", wallet: "optional", auth: "none",
      summary: "transaction history (requires TronGrid)", fields, input: fields,
      examples: [{ cmd: "wallet-cli tron account history --network nile --limit 10" }],
      run: async (ctx, net, input) => {
        const base = net!.tronGridUrl;
        if (!base) throw new ExecutionError("indexer_not_configured", "set networks.<id>.tronGridUrl to enable history");
        const address = input.address ?? ctx.resolveAddress("tron");
        const path = input.only === "token" ? "transactions/trc20" : "transactions";
        const url = `${base.replace(/\/$/, "")}/v1/accounts/${address}/${path}?limit=${input.limit}`;
        let res: Response;
        try {
          res = await fetch(url);
        } catch (e) {
          throw new ExecutionError("rpc_error", `TronGrid request failed: ${(e as Error).message}`);
        }
        if (!res.ok) throw new ExecutionError("rpc_error", `TronGrid returned ${res.status}`);
        const body: any = await res.json();
        return { address, only: input.only ?? "all", count: body?.data?.length ?? 0, records: body?.data ?? [] };
      },
    };
  }

  // ── token ───────────────────────────────────────────────────────────────────
  #tokenBalance(): CommandDefinition {
    const fields = z.object({
      address: Schemas.base58Address().optional().describe("holder (default: active)"),
      contract: Schemas.base58Address().optional().describe("TRC20 contract"),
      assetId: z.string().regex(/^\d+$/).optional().describe("TRC10 asset id"),
    });
    return {
      id: "tron.token.balance", path: ["token", "balance"], family: "tron",
      network: "optional", wallet: "optional", auth: "none", capability: "account.balance.token",
      summary: "single token balance (TRC20 via --contract, TRC10 via --asset-id)",
      fields, input: fields.superRefine(tokenSelector),
      examples: [{ cmd: "wallet-cli tron token balance --network nile --contract TR7..." }],
      run: async (ctx, net, input) => {
        const address = input.address ?? ctx.resolveAddress("tron");
        const rpc = rpcOf(net!);
        const balance = input.contract
          ? await rpc.getTrc20Balance(input.contract, address)
          : await rpc.getTrc10Balance(input.assetId!, address);
        return { address, token: input.contract ?? input.assetId, balance };
      },
    };
  }

  #tokenInfo(): CommandDefinition {
    const fields = z.object({
      contract: Schemas.base58Address().optional().describe("TRC20 contract"),
      assetId: z.string().regex(/^\d+$/).optional().describe("TRC10 asset id"),
    });
    return {
      id: "tron.token.info", path: ["token", "info"], family: "tron",
      network: "optional", wallet: "none", auth: "none", capability: "account.balance.token",
      summary: "token metadata (name/symbol/decimals/totalSupply)",
      fields, input: fields.superRefine(tokenSelector),
      examples: [{ cmd: "wallet-cli tron token info --network nile --contract TR7..." }],
      run: async (_ctx, net, input) => {
        const rpc = rpcOf(net!);
        return input.contract ? rpc.getTokenInfo(input.contract) : rpc.getTrc10Info(input.assetId!);
      },
    };
  }

  // ── tx ──────────────────────────────────────────────────────────────────────
  #sendNative(): CommandDefinition {
    const services = this.services;
    const fields = z.object({
      to: Schemas.base58Address().describe("recipient TRON address"),
      amountSun: Schemas.uintString().describe("amount in SUN"),
      ...txModeFields,
    });
    return {
      id: "tron.tx.send-native", path: ["tx", "send-native"], family: "tron",
      network: "required", wallet: "required", auth: "required", capability: "tx.native.transfer",
      summary: "transfer native SUN", fields, input: fields,
      examples: [{ cmd: "wallet-cli tron tx send-native --network nile --to T... --amount-sun 1000000 --broadcast" }],
      run: async (ctx, net, input) => {
        const mode = txMode(input);
        const outcome = await services.txPipeline.run({
          ctx, net: net!, account: ctx.activeAccount, ...mode,
          build: (from) => rpcOf(net!).buildNativeTransfer(from, input.to, input.amountSun),
          estimate: async () => ({ feeModel: "tron-resource", bandwidthBurnSunIfNoFreeze: 100000 }),
        });
        return outcomeData(outcome);
      },
    };
  }

  #sendToken(): CommandDefinition {
    const services = this.services;
    const fields = z.object({
      to: Schemas.base58Address().describe("recipient TRON address"),
      amount: Schemas.amount().describe("amount in the token's smallest unit"),
      contract: Schemas.base58Address().optional().describe("TRC20 contract"),
      assetId: z.string().regex(/^\d+$/).optional().describe("TRC10 asset id"),
      feeLimit: z.coerce.number().int().positive().default(100_000_000).describe("energy fee cap (SUN)"),
      ...txModeFields,
    });
    return {
      id: "tron.tx.send-token", path: ["tx", "send-token"], family: "tron",
      network: "required", wallet: "required", auth: "required", capability: "tx.token.transfer",
      summary: "transfer TRC20 (--contract) or TRC10 (--asset-id)",
      fields, input: fields.superRefine(tokenSelector),
      examples: [{ cmd: "wallet-cli tron tx send-token --network nile --to T... --amount 1000000 --contract TR7... --broadcast" }],
      run: async (ctx, net, input) => {
        const mode = txMode(input);
        const rpc = rpcOf(net!);
        const outcome = await services.txPipeline.run({
          ctx, net: net!, account: ctx.activeAccount, ...mode,
          build: (from) =>
            input.contract
              ? rpc.buildTrc20Transfer(from, input.to, input.contract, input.amount, input.feeLimit)
              : rpc.buildTrc10Transfer(from, input.to, input.assetId!, input.amount),
          estimate: (_tx) =>
            input.contract
              ? rpc.estimateResources(ctx.resolveAddress("tron"), input.contract, "transfer(address,uint256)", [
                  { type: "address", value: input.to },
                  { type: "uint256", value: input.amount },
                ])
              : Promise.resolve({ feeModel: "tron-resource", note: "TRC10 transfer uses bandwidth only" }),
        });
        return outcomeData(outcome);
      },
    };
  }

  #broadcast(): CommandDefinition {
    // --transaction <value> OR --tx-file (global data channel); auth:none (holds no key).
    const fields = z.object({ transaction: z.string().optional().describe("presigned tx (or use --tx-file)") });
    return {
      id: "tron.tx.broadcast", path: ["tx", "broadcast"], family: "tron",
      network: "required", wallet: "none", auth: "none", capability: "tx.broadcast",
      summary: "broadcast a presigned transaction", fields, input: fields,
      examples: [{ cmd: "wallet-cli tron tx broadcast --network nile --tx-file signed.json" }],
      run: async (ctx, net, input) => {
        const raw = ctx.secrets.pick(input.transaction, "tx", "transaction");
        let signed: unknown;
        try {
          signed = JSON.parse(raw);
        } catch {
          throw new UsageError("invalid_value", "TRON presigned tx must be JSON");
        }
        return { stage: "broadcast", ...(await net!.rpc!.broadcast(signed)) };
      },
    };
  }

  #txStatus(): CommandDefinition {
    const fields = z.object({ txid: z.string().min(1).describe("transaction id") });
    return {
      id: "tron.tx.status", path: ["tx", "status"], family: "tron",
      network: "optional", wallet: "none", auth: "none",
      summary: "confirmation status of a transaction", fields, input: fields,
      examples: [{ cmd: "wallet-cli tron tx status --network nile --txid abc123" }],
      run: async (_ctx, net, input) => {
        const info: any = await rpcOf(net!).getTransactionInfoById(input.txid);
        const confirmed = info && info.blockNumber !== undefined;
        return { txid: input.txid, confirmed: !!confirmed, blockNumber: info?.blockNumber, result: info?.receipt?.result };
      },
    };
  }

  #txInfo(): CommandDefinition {
    const fields = z.object({ txid: z.string().min(1).describe("transaction id") });
    return {
      id: "tron.tx.info", path: ["tx", "info"], family: "tron",
      network: "optional", wallet: "none", auth: "none",
      summary: "full transaction detail + receipt", fields, input: fields,
      examples: [{ cmd: "wallet-cli tron tx info --network nile --txid abc123" }],
      run: async (_ctx, net, input) => {
        const rpc = rpcOf(net!);
        const [tx, info] = await Promise.all([rpc.getTransactionById(input.txid), rpc.getTransactionInfoById(input.txid)]);
        return { txid: input.txid, transaction: tx, info };
      },
    };
  }

  // ── resource (Stake 2.0) ──────────────────────────────────────────────────────
  #stakeCmd(
    id: string, action: string, summary: string,
    build: (rpc: TronRpcClient, owner: string, input: any) => Promise<unknown>,
    extra: z.ZodRawShape = {},
  ): CommandDefinition {
    const services = this.services;
    const fields = z.object({ ...extra, ...txModeFields });
    return {
      id, path: ["resource", action], family: "tron",
      network: "required", wallet: "required", auth: "required", capability: "staking.freeze",
      summary, fields, input: fields,
      examples: [{ cmd: `wallet-cli tron resource ${action} --network nile --broadcast` }],
      run: async (ctx, net, input) => {
        const mode = txMode(input);
        const rpc = rpcOf(net!);
        const outcome = await services.txPipeline.run({
          ctx, net: net!, account: ctx.activeAccount, ...mode,
          build: (owner) => build(rpc, owner, input),
          estimate: async () => ({ feeModel: "tron-resource", note: "staking ops cost bandwidth" }),
        });
        return outcomeData(outcome);
      },
    };
  }

  #freeze(): CommandDefinition {
    return this.#stakeCmd(
      "tron.resource.freeze", "freeze", "stake TRX for energy/bandwidth (FreezeBalanceV2)",
      (rpc, owner, i) => rpc.buildFreezeV2(owner, i.amountSun, i.resource === "energy" ? "ENERGY" : "BANDWIDTH"),
      {
        amountSun: Schemas.uintString().describe("amount to freeze (SUN)"),
        resource: z.enum(["energy", "bandwidth"]).default("bandwidth").describe("resource type"),
      },
    );
  }
  #unfreeze(): CommandDefinition {
    return this.#stakeCmd(
      "tron.resource.unfreeze", "unfreeze", "unstake TRX (UnfreezeBalanceV2)",
      (rpc, owner, i) => rpc.buildUnfreezeV2(owner, i.amountSun, i.resource === "energy" ? "ENERGY" : "BANDWIDTH"),
      {
        amountSun: Schemas.uintString().describe("amount to unfreeze (SUN)"),
        resource: z.enum(["energy", "bandwidth"]).default("bandwidth").describe("resource type"),
      },
    );
  }
  #withdraw(): CommandDefinition {
    return this.#stakeCmd(
      "tron.resource.withdraw", "withdraw", "withdraw expired unfrozen TRX",
      (rpc, owner) => rpc.buildWithdrawExpireUnfreeze(owner),
    );
  }
  #cancelUnfreeze(): CommandDefinition {
    return this.#stakeCmd(
      "tron.resource.cancel-unfreeze", "cancel-unfreeze", "cancel all pending unstakes (roll back to frozen)",
      (rpc, owner) => rpc.buildCancelAllUnfreezeV2(owner),
    );
  }

  #prices(): CommandDefinition {
    const fields = z.object({});
    return {
      id: "tron.resource.prices", path: ["resource", "prices"], family: "tron",
      network: "optional", wallet: "none", auth: "none", capability: "resources.energy",
      summary: "energy / bandwidth unit prices", fields, input: fields,
      examples: [{ cmd: "wallet-cli tron resource prices --network nile" }],
      run: async (_ctx, net) => {
        const rpc = rpcOf(net!);
        const [energy, bandwidth] = await Promise.all([rpc.getEnergyPrices(), rpc.getBandwidthPrices()]);
        return { energyPrices: energy, bandwidthPrices: bandwidth };
      },
    };
  }

  // ── block ──────────────────────────────────────────────────────────────────────
  #blockGet(): CommandDefinition {
    const fields = z.object({ number: z.coerce.number().int().nonnegative().optional().describe("block number (default: latest)") });
    return {
      id: "tron.block.get", path: ["block", "get"], family: "tron",
      network: "optional", wallet: "none", auth: "none",
      summary: "get a block (latest if omitted)", fields, input: fields,
      examples: [{ cmd: "wallet-cli tron block get --network nile" }],
      run: async (_ctx, net, input) => ({ block: await rpcOf(net!).getBlock(input.number) }),
    };
  }

  // ── contract ─────────────────────────────────────────────────────────────────
  #contractCall(): CommandDefinition {
    const fields = z.object({
      contract: Schemas.base58Address().describe("contract address"),
      method: z.string().min(1).describe("function signature, e.g. balanceOf(address)"),
      params: z.string().optional().describe("JSON array of {type,value}"),
    });
    return {
      id: "tron.contract.call", path: ["contract", "call"], family: "tron",
      network: "optional", wallet: "optional", auth: "none", capability: "contract.call",
      summary: "read-only call (triggerConstantContract)", fields, input: fields,
      examples: [{ cmd: `wallet-cli tron contract call --network nile --contract TR7... --method "balanceOf(address)" --params '[{"type":"address","value":"T..."}]'` }],
      run: async (_ctx, net, input) => {
        const result = await rpcOf(net!).triggerConstantContract(input.contract, input.method, parseParams(input.params));
        return { contract: input.contract, method: input.method, result };
      },
    };
  }

  #contractSend(): CommandDefinition {
    const services = this.services;
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
      network: "required", wallet: "required", auth: "required", capability: "contract.call",
      summary: "state-changing call (triggerSmartContract)", fields, input: fields,
      examples: [{ cmd: `wallet-cli tron contract send --network nile --contract TR7... --method "transfer(address,uint256)" --params '[...]' --broadcast` }],
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

  #contractDeploy(): CommandDefinition {
    const services = this.services;
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
      network: "required", wallet: "required", auth: "required", capability: "contract.deploy",
      summary: "deploy a smart contract", fields, input: fields,
      examples: [{ cmd: "wallet-cli tron contract deploy --network nile --abi '[...]' --bytecode 60... --fee-limit 1000000000 --broadcast" }],
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

  #contractInfo(): CommandDefinition {
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
}
