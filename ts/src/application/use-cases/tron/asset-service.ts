// Inputs use whole tokens; chain quantities and returned supply amounts use minimal units.
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { ChainError, errorMessage, inputRef, UsageError } from "../../../domain/errors/index.js";
import { assertPositive, toBaseUnits } from "../../../domain/amounts/index.js";
import {
  icoPriceLabel,
  icoRate,
  icoTokensFor,
  trc10Description,
  trc10Precision,
  trc10Supply,
  trc10Symbol,
  trc10Url,
  type IcoRate,
} from "../../../domain/tron/asset/index.js";
import { tronHexToBase58 } from "../../../domain/address/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type {
  TronAsset,
  TronAssetTranche,
  TronGateway,
} from "../../ports/chain/tron/tron-gateway.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import {
  outcomeData,
  receiptOf,
  transactionMode,
  transactionRequiresSigner,
  type TransactionModeInput,
} from "../../services/transaction-mode.js";
import { tronConfirmation } from "../../services/tron/tron-confirmation.js";
import { tronTransactionHooks } from "./multisig-authorization.js";
import { FAMILIES } from "../../../domain/family/index.js";

const DAY_MS = 86_400_000;
const TRX_DECIMALS = FAMILIES.tron.nativeDecimals;

export interface AssetIssueInput extends TransactionModeInput {
  name: string;
  supply: string;
  price: string;
  start: string;
  end: string;
  url: string;
  abbr?: string;
  precision?: number;
  description?: string;
  freeNetPerAccount?: number;
  publicFreeNet?: number;
  freeze?: string[];
}
export interface AssetUpdateInput extends TransactionModeInput {
  description?: string;
  url?: string;
  freeNetPerAccount?: number;
  publicFreeNet?: number;
}
export interface AssetParticipateInput extends TransactionModeInput {
  assetRef: string;
  pay: string;
}
export interface AssetInfoInput {
  assetRef?: string;
  issuer?: string;
}
export interface AssetListInput {
  limit: number;
  offset: number;
}

export class TronAssetService {
  constructor(
    private readonly gateways: ChainGatewayProvider,
    private readonly pipeline: TxPipeline,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async info(network: NetworkDescriptor, input: AssetInfoInput) {
    const gateway = this.gateways.get(network, "tron");
    if ((input.assetRef === undefined) === (input.issuer === undefined)) {
      throw new UsageError(
        "invalid_value",
        errorMessage`provide exactly one of <asset> or ${inputRef("issuer")}`,
      );
    }
    const asset =
      input.issuer !== undefined
        ? await gateway.getAssetByIssuer(input.issuer)
        : await this.#resolveAsset(gateway, input.assetRef!);
    if (!asset) throw new ChainError("asset_not_found", "no TRC10 matches that reference");
    return { kind: "asset-info" as const, ...assetView(asset) };
  }

  async list(network: NetworkDescriptor, input: AssetListInput) {
    const gateway = this.gateways.get(network, "tron");
    const assets = await gateway.listAssets(input.limit, input.offset);
    return {
      kind: "asset-list" as const,
      assets: assets.map((asset) => ({
        assetId: String(asset.id),
        name: asset.name,
        issuerAddress: tronHexToBase58(asset.owner_address),
        totalSupply: String(asset.total_supply),
        precision: asset.precision ?? 0,
      })),
      pagination: { offset: input.offset, limit: input.limit },
    };
  }

  async issue(scope: TransactionScope, network: NetworkDescriptor, input: AssetIssueInput) {
    if (transactionRequiresSigner(input)) this.#assertSignable(scope);
    const gateway = this.gateways.get(network, "tron");
    const owner = scope.resolveAddress("tron");

    const precision = trc10Precision(input.precision ?? 0);
    const name = trc10Symbol(input.name, "name");
    const abbr = input.abbr === undefined ? "" : trc10Symbol(input.abbr, "abbr");
    const url = trc10Url(input.url);
    const description = trc10Description(input.description ?? "");
    const supply = trc10Supply(input.supply);
    const rate = parsePrice(input.price, precision);
    const startTime = parseUtcDateTime(input.start, "start");
    const endTime = parseUtcDateTime(input.end, "end");
    if (startTime <= this.now())
      throw new UsageError(
        "invalid_value",
        errorMessage`${inputRef("start")} must be in the future`,
      );
    if (endTime <= startTime) {
      throw new UsageError(
        "invalid_value",
        errorMessage`${inputRef("end")} must be later than ${inputRef("start")}`,
      );
    }
    const scale = 10n ** BigInt(precision);
    const frozenSupply = (input.freeze ?? []).map((entry) => parseTranche(entry, scale));

    if (await gateway.getAssetByIssuer(owner)) {
      throw new ChainError(
        "already_issued_asset",
        "this account has already issued a TRC10; an account may only ever issue one",
      );
    }

    const issuance = {
      name,
      abbr,
      description,
      url,
      totalSupply: toSafeInteger(supply * scale, "supply"),
      trxNum: rate.trxNum,
      num: rate.num,
      precision,
      startTime,
      endTime,
      freeAssetNetLimit: input.freeNetPerAccount ?? 0,
      publicFreeAssetNetLimit: input.publicFreeNet ?? 0,
      frozenSupply,
    };

    const outcome = await this.pipeline.runTron({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      ...tronTransactionHooks(gateway),
      preflight: null,
      confirm: tronConfirmation(gateway, scope),
      build: (from) => gateway.buildAssetIssue(from, issuance),
      estimate: async () => ({
        feeModel: "tron-resource",
        note: "issuance burns the chain's asset issue fee",
      }),
    });
    const data = outcomeData(outcome);
    return {
      kind: "asset-issue" as const,
      ...data,
      // The chain assigns the asset ID on confirmation.
      ...(receiptOf(data).assetIssueID === undefined
        ? {}
        : { assetId: String(receiptOf(data).assetIssueID) }),
      issuerAddress: owner,
      name,
      abbr,
      totalSupply: String(issuance.totalSupply),
      precision,
      price: priceLabel(rate, precision),
      trxNum: rate.trxNum,
      num: rate.num,
      startTime,
      endTime,
      url,
      description,
      freeAssetNetLimit: issuance.freeAssetNetLimit,
      publicFreeAssetNetLimit: issuance.publicFreeAssetNetLimit,
      frozenSupply: frozenSupply.map((t) => ({
        amount: String(t.frozen_amount),
        days: t.frozen_days,
      })),
    };
  }

  async update(scope: TransactionScope, network: NetworkDescriptor, input: AssetUpdateInput) {
    if (transactionRequiresSigner(input)) this.#assertSignable(scope);
    const gateway = this.gateways.get(network, "tron");
    const owner = scope.resolveAddress("tron");
    if (
      input.description === undefined &&
      input.url === undefined &&
      input.freeNetPerAccount === undefined &&
      input.publicFreeNet === undefined
    ) {
      throw new UsageError(
        "invalid_value",
        errorMessage`give at least one of ${inputRef("description")}, ${inputRef("url")}, ${inputRef("freeNetPerAccount")}, ${inputRef("publicFreeNet")}`,
      );
    }
    const asset = await this.#requireOwnAsset(gateway, owner);

    // The chain overwrites all four fields; preserve omitted values.
    const update = {
      description: input.description ?? asset.description ?? "",
      url: input.url ?? asset.url ?? "",
      freeAssetNetLimit: input.freeNetPerAccount ?? asset.free_asset_net_limit ?? 0,
      publicFreeAssetNetLimit: input.publicFreeNet ?? asset.public_free_asset_net_limit ?? 0,
    };
    trc10Url(update.url);
    trc10Description(update.description);

    const outcome = await this.pipeline.runTron({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      ...tronTransactionHooks(gateway),
      preflight: null,
      confirm: tronConfirmation(gateway, scope),
      build: (from) => gateway.buildAssetUpdate(from, update),
      estimate: async () => ({
        feeModel: "tron-resource",
        note: "asset update uses bandwidth only",
      }),
    });
    return {
      kind: "asset-update" as const,
      ...outcomeData(outcome),
      assetId: String(asset.id),
      name: asset.name,
      issuerAddress: owner,
      url: update.url,
      description: update.description,
      freeAssetNetLimit: update.freeAssetNetLimit,
      publicFreeAssetNetLimit: update.publicFreeAssetNetLimit,
    };
  }

  async participate(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: AssetParticipateInput,
  ) {
    if (transactionRequiresSigner(input)) this.#assertSignable(scope);
    const gateway = this.gateways.get(network, "tron");
    const owner = scope.resolveAddress("tron");
    const asset = await this.#resolveAsset(gateway, input.assetRef);
    if (!asset) throw new ChainError("asset_not_found", `no TRC10 matches ${input.assetRef}`);

    const issuer = tronHexToBase58(asset.owner_address);
    if (issuer === owner) {
      throw new ChainError("self_participation", "an issuer cannot participate in its own ICO");
    }
    const now = this.now();
    if (now < asset.start_time || now >= asset.end_time) {
      throw new ChainError(
        "not_in_ico_window",
        `${asset.name} is not accepting participation right now`,
      );
    }
    const paidSun = BigInt(toBaseUnits(input.pay, TRX_DECIMALS, "TRX"));
    const rate: IcoRate = { trxNum: asset.trx_num, num: asset.num };
    const received = icoTokensFor(paidSun, rate);
    if (received === 0n) {
      throw new UsageError(
        "invalid_value",
        errorMessage`${inputRef("pay")} is too small to buy even one unit of this token at its ICO rate`,
      );
    }

    const outcome = await this.pipeline.runTron({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      ...tronTransactionHooks(gateway),
      preflight: null,
      confirm: tronConfirmation(gateway, scope),
      build: (from) =>
        gateway.buildAssetParticipate(from, issuer, String(asset.id), String(paidSun)),
      estimate: async () => ({
        feeModel: "tron-resource",
        note: "ICO participation uses bandwidth only",
      }),
    });
    return {
      kind: "asset-participate" as const,
      ...outcomeData(outcome),
      assetId: String(asset.id),
      name: asset.name,
      issuerAddress: issuer,
      participantAddress: owner,
      paidSun: String(paidSun),
      receivedAmount: String(received),
      precision: asset.precision ?? 0,
    };
  }

  async unfreeze(scope: TransactionScope, network: NetworkDescriptor, input: TransactionModeInput) {
    if (transactionRequiresSigner(input)) this.#assertSignable(scope);
    const gateway = this.gateways.get(network, "tron");
    const owner = scope.resolveAddress("tron");
    const asset = await this.#requireOwnAsset(gateway, owner);

    const tranches = asset.frozen_supply ?? [];
    if (tranches.length === 0) {
      throw new ChainError("no_frozen_supply", `${asset.name} has no frozen supply to release`);
    }
    // Unlocks are relative to start_time, not the block that included issuance.
    const now = this.now();
    const matured = tranches.filter((t) => asset.start_time + t.frozen_days * DAY_MS <= now);
    if (matured.length === 0) {
      const next = Math.min(...tranches.map((t) => asset.start_time + t.frozen_days * DAY_MS));
      throw new ChainError(
        "not_yet_unfreezable",
        `no frozen tranche has matured yet; the earliest unlocks at ${new Date(next).toISOString()}`,
      );
    }
    const releasing = matured.reduce((sum, t) => sum + BigInt(t.frozen_amount), 0n);
    const stillFrozen = tranches.reduce((sum, t) => sum + BigInt(t.frozen_amount), 0n) - releasing;

    const outcome = await this.pipeline.runTron({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      ...tronTransactionHooks(gateway),
      preflight: null,
      confirm: tronConfirmation(gateway, scope),
      build: (from) => gateway.buildAssetUnfreeze(from),
      estimate: async () => ({
        feeModel: "tron-resource",
        note: "releasing frozen supply uses bandwidth only",
      }),
    });
    const data = outcomeData(outcome);
    return {
      kind: "asset-unfreeze" as const,
      ...data,
      assetId: String(asset.id),
      name: asset.name,
      issuerAddress: owner,
      // Prefer the confirmed receipt over the projected release amount.
      releasedAmount: String(receiptOf(data).unfreezeAmount ?? releasing),
      stillFrozenAmount: String(stillFrozen),
      precision: asset.precision ?? 0,
    };
  }

  // Ledger cannot sign these TRC10 issuance operations.
  #assertSignable(scope: TransactionScope): void {
    this.pipeline.assertCanSign(scope.activeAccount, "tron", { requireSoftware: true });
  }

  async #requireOwnAsset(gateway: TronGateway, owner: string): Promise<TronAsset> {
    const asset = await gateway.getAssetByIssuer(owner);
    if (!asset) {
      throw new ChainError("not_an_issuer", "this account has not issued a TRC10");
    }
    return asset;
  }

  async #resolveAsset(gateway: TronGateway, reference: string): Promise<TronAsset | undefined> {
    if (/^\d+$/.test(reference)) return gateway.getAssetById(reference);
    const matches = await gateway.getAssetsByName(reference);
    if (matches.length > 1) {
      // Quantities use minimal units.
      throw new ChainError(
        "ambiguous_asset_name",
        `${matches.length} TRC10 tokens are named ${reference}; re-run with the id`,
        {
          name: reference,
          assetIds: matches.map((a) => String(a.id)),
          matches: matches.map((a) => ({
            assetId: String(a.id),
            issuerAddress: tronHexToBase58(a.owner_address),
            totalSupply: String(a.total_supply),
            precision: a.precision ?? 0,
          })),
        },
      );
    }
    return matches[0];
  }
}

function assetView(asset: TronAsset) {
  const precision = asset.precision ?? 0;
  const rate: IcoRate = { trxNum: asset.trx_num, num: asset.num };
  return {
    assetId: String(asset.id),
    name: asset.name,
    abbr: asset.abbr ?? "",
    issuerAddress: tronHexToBase58(asset.owner_address),
    totalSupply: String(asset.total_supply),
    precision,
    price: priceLabel(rate, precision),
    trxNum: rate.trxNum,
    num: rate.num,
    startTime: asset.start_time,
    endTime: asset.end_time,
    url: asset.url ?? "",
    description: asset.description ?? "",
    freeAssetNetLimit: asset.free_asset_net_limit ?? 0,
    publicFreeAssetNetLimit: asset.public_free_asset_net_limit ?? 0,
    frozenSupply: (asset.frozen_supply ?? []).map((t) => ({
      amount: String(t.frozen_amount),
      days: t.frozen_days,
      expireTime: asset.start_time + t.frozen_days * DAY_MS,
    })),
  };
}

function priceLabel(rate: IcoRate, precision: number): string {
  const { trx, tokens } = icoPriceLabel(rate, precision);
  return `${trx}:${tokens}`;
}

function parsePrice(value: string, precision: number): IcoRate {
  const match = /^(\d+):(\d+)$/.exec(value.trim());
  if (!match) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef("price")} must be <trx>:<tokens>, e.g. 1:100`,
    );
  }
  return icoRate(BigInt(match[1]!), BigInt(match[2]!), precision);
}

// Parse whole-token <amount>:<days> into minimal units.
function parseTranche(value: string, scale: bigint): TronAssetTranche {
  const match = /^(\d+):(\d+)$/.exec(value.trim());
  if (!match) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef("freeze")} must be <amount>:<days>, e.g. 100000000:30`,
    );
  }
  const amount = assertPositive(BigInt(match[1]!), errorMessage`${inputRef("freeze")} amount`);
  const days = assertPositive(Number(match[2]!), errorMessage`${inputRef("freeze")} days`);
  return { frozen_amount: toSafeInteger(amount * scale, "freeze"), frozen_days: days };
}

function parseUtcDateTime(value: string, field: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?$/.exec(value.trim());
  if (!match) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef(field)} must be YYYY-MM-DD or "YYYY-MM-DD HH:mm:ss" (read as UTC)`,
    );
  }
  const [, y, mo, d, h = "00", mi = "00", s = "00"] = match;
  const stamp = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  // Reject Date.UTC rollover in both date and time components.
  const iso = new Date(stamp).toISOString();
  if (iso.slice(0, 19) !== `${y}-${mo}-${d}T${h}:${mi}:${s}`) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef(field)} is not a real date and time`,
    );
  }
  return stamp;
}

// TronWeb passes int64 fields as JS numbers; reject precision loss.
function toSafeInteger(value: bigint, field: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef(field)} is too large to represent exactly at this precision`,
    );
  }
  return Number(value);
}
