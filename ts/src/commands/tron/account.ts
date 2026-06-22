/**
 * TRON account group (L4) — native balance + resources/assets/info/history.
 */
import { z } from "zod";
import type { CommandDefinition, EffectiveTokenEntry, TokenEntry } from "../../core/types/index.js";
import { ExecutionError } from "../../core/errors/index.js";
import { Schemas } from "../../infra/contract/index.js";
import type { Services } from "../services.js";
import { balanceCommand } from "../shared.js";
import { rpcOf, tokenSelector } from "./shared.js";

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

function accountResources(): CommandDefinition {
  const fields = z.object({});
  return {
    id: "tron.account.resources", path: ["account", "resources"], family: "tron",
    network: "optional", wallet: "optional", auth: "none", capability: "resources.bandwidth",
    summary: "bandwidth/energy + staking (frozen, unfreezing, withdrawable)", fields, input: fields,
    examples: [{ cmd: "wallet-cli tron account resources --network nile" }],
    run: async (ctx, net) => {
      const address = ctx.resolveAddress("tron");
      const rpc = rpcOf(net!);
      const [res, acct] = await Promise.all([rpc.getAccountResources(address), rpc.getAccount(address)]);
      return { address, ...mapResources(res, acct) };
    },
  };
}

function accountAssets(): CommandDefinition {
  const fields = z.object({
    tokens: z.string().optional().describe("comma-separated token ids to query; each item is a TRC20 contract address or TRC10 numeric asset id; omit to return an empty token list"),
  });
  return {
    id: "tron.account.assets", path: ["account", "assets"], family: "tron",
    network: "optional", wallet: "optional", auth: "none", capability: "account.balance.token",
    summary: "per-token balances (no indexer needed)", fields, input: fields,
    examples: [{ cmd: "wallet-cli tron account assets --network nile --tokens TR7...,1002000" }],
    run: async (ctx, net, input) => {
      const address = ctx.resolveAddress("tron");
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

function accountInfo(): CommandDefinition {
  const fields = z.object({});
  return {
    id: "tron.account.info", path: ["account", "info"], family: "tron",
    network: "optional", wallet: "optional", auth: "none",
    summary: "raw account (getAccount passthrough)", fields, input: fields,
    examples: [{ cmd: "wallet-cli tron account info --network nile" }],
    run: async (ctx, net) => {
      const address = ctx.resolveAddress("tron");
      return { address, account: await rpcOf(net!).getAccount(address) };
    },
  };
}

function accountHistory(): CommandDefinition {
  const fields = z.object({
    limit: z.coerce.number().int().positive().max(200).default(20).describe("maximum records to return, in records; range: 1-200"),
    only: z.enum(["native", "token"]).optional().describe("filter history by transfer type; omit to show all transfer types"),
  });
  return {
    id: "tron.account.history", path: ["account", "history"], family: "tron",
    network: "optional", wallet: "optional", auth: "none",
    summary: "transaction history (requires TronGrid)", fields, input: fields,
    examples: [{ cmd: "wallet-cli tron account history --network nile --limit 10" }],
    run: async (ctx, net, input) => {
      const base = net!.tronGridUrl;
      if (!base) throw new ExecutionError("indexer_not_configured", "set networks.<id>.tronGridUrl to enable history");
      const address = ctx.resolveAddress("tron");
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

// ── token address-book (§7.17) ────────────────────────────────────────────────
const tokenBookFields = z.object({
  contract: Schemas.base58Address().optional().describe("TRC20 contract address; provide exactly one of --contract or --asset-id"),
  assetId: z.string().regex(/^\d+$/).optional().describe("TRC10 numeric asset id; provide exactly one of --asset-id or --contract"),
});

/** tronweb returns TRC10 name/abbr either decoded or hex-encoded; decode hex best-effort. */
function decodeMaybeHex(v: unknown): string | undefined {
  if (typeof v !== "string" || v === "") return undefined;
  if (/^[0-9a-fA-F]+$/.test(v) && v.length % 2 === 0) {
    try {
      const s = Buffer.from(v, "hex").toString("utf8");
      if (/^[\x20-\x7e]+$/.test(s)) return s; // printable ASCII → it was hex-encoded text
    } catch { /* fall through */ }
  }
  return v;
}

/** fetch symbol/decimals for the requested token; missing → token_metadata_unavailable. */
async function fetchTokenEntry(rpc: ReturnType<typeof rpcOf>, input: { contract?: string; assetId?: string }): Promise<TokenEntry> {
  if (input.contract) {
    const info: any = await rpc.getTokenInfo(input.contract);
    const symbol = info?.symbol ? String(info.symbol) : undefined;
    if (!symbol || info?.decimals === undefined) {
      throw new ExecutionError("token_metadata_unavailable", `could not read symbol/decimals for ${input.contract}`);
    }
    return { kind: "trc20", id: input.contract, symbol, decimals: Number(info.decimals), name: info?.name ? String(info.name) : undefined };
  }
  const info: any = await rpc.getTrc10Info(input.assetId!);
  const symbol = decodeMaybeHex(info?.abbr) ?? decodeMaybeHex(info?.name);
  if (!symbol) {
    throw new ExecutionError("token_metadata_unavailable", `could not read TRC10 asset ${input.assetId}`);
  }
  // TRC10 precision is optional on-chain and defaults to 0 decimals.
  return { kind: "trc10", id: input.assetId!, symbol, decimals: Number(info?.precision ?? 0), name: decodeMaybeHex(info?.name) };
}

function addToken(services: Services): CommandDefinition {
  return {
    id: "tron.account.add-token", path: ["account", "add-token"], family: "tron",
    network: "optional", wallet: "optional", auth: "none", capability: "account.tokenbook",
    summary: "add a custom token to the address book (fetches symbol/decimals)",
    fields: tokenBookFields, input: tokenBookFields.superRefine(tokenSelector),
    examples: [{ cmd: "wallet-cli tron account add-token --network nile --contract TR7..." }],
    run: async (ctx, net, input) => {
      const entry = await fetchTokenEntry(rpcOf(net!), input);
      const action = services.tokenBook.add(net!.id, ctx.activeAccount, entry);
      return { network: net!.id, account: ctx.activeAccount, action, token: entry };
    },
  };
}

function listTokens(services: Services): CommandDefinition {
  const fields = z.object({});
  return {
    id: "tron.account.list-tokens", path: ["account", "list-tokens"], family: "tron",
    network: "optional", wallet: "optional", auth: "none", capability: "account.tokenbook",
    summary: "list the token address-book (official + user; no balances)", fields, input: fields,
    examples: [{ cmd: "wallet-cli tron account list-tokens --network nile" }],
    run: async (ctx, net) => {
      const tokens = services.tokenBook.effective(net!.id, ctx.activeAccount);
      return { network: net!.id, account: ctx.activeAccount, tokens };
    },
  };
}

function removeToken(services: Services): CommandDefinition {
  return {
    id: "tron.account.remove-token", path: ["account", "remove-token"], family: "tron",
    network: "optional", wallet: "optional", auth: "none", capability: "account.tokenbook",
    summary: "remove a user-added token from the address book",
    fields: tokenBookFields, input: tokenBookFields.superRefine(tokenSelector),
    examples: [{ cmd: "wallet-cli tron account remove-token --network nile --contract TR7..." }],
    run: async (ctx, net, input) => {
      const kind = input.contract ? "trc20" as const : "trc10" as const;
      const id = input.contract ?? input.assetId!;
      const removed = services.tokenBook.remove(net!.id, ctx.activeAccount, kind, id);
      return { network: net!.id, account: ctx.activeAccount, removed };
    },
  };
}

/** bigint base-unit string → human decimal string (no float). */
function humanAmount(raw: string, decimals: number): string {
  const neg = raw.startsWith("-");
  const digits = (neg ? raw.slice(1) : raw).padStart(decimals + 1, "0");
  const cut = digits.length - decimals;
  const frac = digits.slice(cut).replace(/0+$/, "");
  return (neg ? "-" : "") + (frac ? `${digits.slice(0, cut)}.${frac}` : digits.slice(0, cut));
}
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;
function holding(kind: string, symbol: string, decimals: number, raw: string, price: number | null, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const balance = humanAmount(raw, decimals);
  const valueUsd = price === null ? null : round6(Number(balance) * price);
  return { kind, symbol, decimals, rawBalance: raw, balance, priceUsd: price, valueUsd, ...extra };
}

function portfolio(services: Services): CommandDefinition {
  const fields = z.object({});
  return {
    id: "tron.account.portfolio", path: ["account", "portfolio"], family: "tron",
    network: "optional", wallet: "optional", auth: "none", capability: "account.portfolio",
    summary: "native TRX + address-book token balances with best-effort USD valuation", fields, input: fields,
    examples: [{ cmd: "wallet-cli tron account portfolio --network nile" }],
    run: async (ctx, net, _input) => {
      const address = ctx.resolveAddress("tron");
      const rpc = rpcOf(net!);
      const tokens = services.tokenBook.effective(net!.id, ctx.activeAccount);

      // balances: native + every book token (RPC; required — failure surfaces as rpc_error).
      const [nativeRaw, tokenBalances] = await Promise.all([
        rpc.getNativeBalance(address),
        Promise.all(tokens.map((t) => (t.kind === "trc10" ? rpc.getTrc10Balance(t.id, address) : rpc.getTrc20Balance(t.id, address)))),
      ]);

      // prices: best-effort — provider swallows its own errors; guard defensively anyway so a
      // price failure can NEVER fail the balance read (§7.17).
      const priceSource = services.priceProvider.source;
      let priceError: string | undefined;
      let nativePrice: number | null = null;
      let tokenPrices = new Map<string, number | null>();
      try {
        const trc20 = tokens.filter((t) => t.kind === "trc20").map((t) => t.id);
        [nativePrice, tokenPrices] = await Promise.all([
          services.priceProvider.nativeUsd(net!.id),
          services.priceProvider.tokenUsd(net!.id, trc20),
        ]);
      } catch (e) {
        priceError = (e as Error).message;
      }

      const holdings: Record<string, unknown>[] = [
        holding("native", "TRX", 6, nativeRaw, nativePrice),
        ...tokens.map((t: EffectiveTokenEntry, i) =>
          holding(t.kind, t.symbol, t.decimals, tokenBalances[i]!, t.kind === "trc20" ? tokenPrices.get(t.id) ?? null : null, {
            id: t.id, name: t.name, source: t.source,
          }),
        ),
      ];
      const values = holdings.map((h) => h.valueUsd).filter((v): v is number => typeof v === "number");
      const totalValueUsd = values.length ? round6(values.reduce((a, b) => a + b, 0)) : null;

      return { network: net!.id, account: ctx.activeAccount, address, priceSource, ...(priceError ? { priceError } : {}), holdings, totalValueUsd };
    },
  };
}

export function accountCommands(services: Services): CommandDefinition[] {
  return [
    balanceCommand("tron"), accountResources(), accountAssets(), accountInfo(), accountHistory(),
    addToken(services), listTokens(services), removeToken(services), portfolio(services),
  ];
}
