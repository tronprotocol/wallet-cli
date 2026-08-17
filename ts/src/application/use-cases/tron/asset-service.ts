/**
 * TRC10 assets — the `asset` command group.
 *
 * TRC10 is a chain-native token with issuance, an ICO window and frozen supply, which is why it is
 * a group of its own rather than part of `token` (TRC20 contracts). Transfer is deliberately not
 * here: `tx send` with an asset id already covers it.
 *
 * Two conventions run through everything below:
 *   - command input and text output use whole tokens; json and the chain use minimal units.
 *   - local rejection is limited to what we can compute exactly or read for free while building
 *     (see docs/adr/0006). Chain bounds we cannot read are left to the node — a rejected
 *     transaction never enters a block, so it costs neither fee nor bandwidth.
 */
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { ChainError, UsageError } from "../../../domain/errors/index.js";
import { toBaseUnits } from "../../../domain/amounts/index.js";
import { icoPriceLabel, icoRate, icoTokensFor, type IcoRate } from "../../../domain/asset/index.js";
import { tronHexToBase58 } from "../../../domain/address/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronAsset, TronAssetTranche, TronGateway } from "../../ports/chain/tron-gateway.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import {
  outcomeData,
  transactionMode,
  transactionRequiresSigner,
  type TransactionModeInput,
} from "../../services/transaction-mode.js";
import { tronConfirmation } from "../../services/tron-confirmation.js";
import { tronTransactionHooks } from "./multisig-authorization.js";

const DAY_MS = 86_400_000;
const TRX_DECIMALS = 6;
/** name/abbr accept printable ASCII only — the chain rejects spaces and any non-ASCII byte. */
const VISIBLE_ASCII = /^[\x21-\x7E]{1,32}$/;

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

  // ── reads ────────────────────────────────────────────────────────────────────
  async info(network: NetworkDescriptor, input: AssetInfoInput) {
    const gateway = this.gateways.get(network, "tron");
    if ((input.assetRef === undefined) === (input.issuer === undefined)) {
      throw new UsageError("invalid_value", "provide exactly one of <asset> or --issuer");
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

  // ── writes ───────────────────────────────────────────────────────────────────
  async issue(scope: TransactionScope, network: NetworkDescriptor, input: AssetIssueInput) {
    if (transactionRequiresSigner(input)) this.#assertSignable(scope);
    const gateway = this.gateways.get(network, "tron");
    const owner = scope.resolveAddress("tron");

    const precision = input.precision ?? 0;
    const name = requireVisibleAscii(input.name, "--name");
    const abbr = input.abbr === undefined ? "" : requireVisibleAscii(input.abbr, "--abbr");
    const url = requireByteLength(input.url, 256, "--url", { allowEmpty: false });
    const description = requireByteLength(input.description ?? "", 200, "--description", {
      allowEmpty: true,
    });
    const supply = requirePositiveInteger(input.supply, "--supply");
    const rate = parsePrice(input.price, precision);
    const startTime = parseUtcDateTime(input.start, "--start");
    const endTime = parseUtcDateTime(input.end, "--end");
    if (startTime <= this.now())
      throw new UsageError("invalid_value", "--start must be in the future");
    if (endTime <= startTime)
      throw new UsageError("invalid_value", "--end must be later than --start");
    const scale = 10n ** BigInt(precision);
    const frozenSupply = (input.freeze ?? []).map((entry) => parseTranche(entry, scale));

    // `asset issue` burns the issuance fee and an account may issue only once, ever — worth one
    // read to refuse before that is spent. Every other bound is left to the node (ADR-0006).
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
      totalSupply: toSafeInteger(supply * scale, "--supply"),
      trxNum: rate.trxNum,
      num: rate.num,
      precision,
      startTime,
      endTime,
      freeAssetNetLimit: input.freeNetPerAccount ?? 0,
      publicFreeAssetNetLimit: input.publicFreeNet ?? 0,
      frozenSupply,
    };

    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      ...tronTransactionHooks(gateway),
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
      // the chain assigns the id; it does not exist until the transaction confirms (ADR/deviations D6)
      ...(data.assetIssueID === undefined ? {} : { assetId: String(data.assetIssueID) }),
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
        "give at least one of --description, --url, --free-net-per-account, --public-free-net",
      );
    }
    const asset = await this.#requireOwnAsset(gateway, owner);

    // The chain overwrites all four fields, so anything not given is read back and rewritten
    // unchanged — otherwise omitting a flag would silently blank it.
    const update = {
      description: input.description ?? asset.description ?? "",
      url: input.url ?? asset.url ?? "",
      freeAssetNetLimit: input.freeNetPerAccount ?? asset.free_asset_net_limit ?? 0,
      publicFreeAssetNetLimit: input.publicFreeNet ?? asset.public_free_asset_net_limit ?? 0,
    };
    requireByteLength(update.url, 256, "--url", { allowEmpty: false });
    requireByteLength(update.description, 200, "--description", { allowEmpty: true });

    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      ...tronTransactionHooks(gateway),
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
    // TRX carries 6 decimals, so --pay is a decimal amount, not whole TRX only.
    const paidSun = BigInt(toBaseUnits(input.pay, TRX_DECIMALS, "TRX"));
    if (paidSun <= 0n) throw new UsageError("invalid_value", "--pay must be greater than zero");
    const rate: IcoRate = { trxNum: asset.trx_num, num: asset.num };
    const received = icoTokensFor(paidSun, rate);
    if (received === 0n) {
      throw new UsageError(
        "invalid_value",
        "--pay is too small to buy even one unit of this token at its ICO rate",
      );
    }

    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      ...tronTransactionHooks(gateway),
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
      // exact integer arithmetic from the asset's fixed rate — no receipt field needed
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
    // Each tranche's unlock is fixed at issuance: start_time + days, regardless of when the
    // issuance actually landed. The chain releases every matured tranche in one transaction.
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

    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      ...tronTransactionHooks(gateway),
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
      // the receipt is authoritative once confirmed; before that we can only state our own plan
      releasedAmount: String(data.unfreezeAmount ?? releasing),
      stillFrozenAmount: String(stillFrozen),
      precision: asset.precision ?? 0,
    };
  }

  // ── helpers ──────────────────────────────────────────────────────────────────
  /** The Ledger TRON app cannot parse any TRC10 issuance contract type — refuse before the
   *  device is touched rather than after (docs/adr/0003). */
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

  /** numeric reference → id lookup; anything else → name lookup, which may be ambiguous. */
  async #resolveAsset(gateway: TronGateway, reference: string): Promise<TronAsset | undefined> {
    if (/^\d+$/.test(reference)) return gateway.getAssetById(reference);
    const matches = await gateway.getAssetsByName(reference);
    if (matches.length > 1) {
      // `assetIds` is the machine-readable answer ("which ids do I re-run with?"); `matches` carries
      // the columns a human needs to actually pick one, and is what the text renderer tables up.
      // Quantities stay raw (minimal units) here, exactly as the success payload reports them.
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

/** the full read view of an asset, shared by `asset info`. */
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
  if (!match) throw new UsageError("invalid_value", "--price must be <trx>:<tokens>, e.g. 1:100");
  return icoRate(BigInt(match[1]!), BigInt(match[2]!), precision);
}

/** `<amount>:<days>` in whole tokens → a chain tranche in minimal units. */
function parseTranche(value: string, scale: bigint): TronAssetTranche {
  const match = /^(\d+):(\d+)$/.exec(value.trim());
  if (!match)
    throw new UsageError("invalid_value", "--freeze must be <amount>:<days>, e.g. 100000000:30");
  const amount = BigInt(match[1]!);
  const days = Number(match[2]!);
  if (amount <= 0n)
    throw new UsageError("invalid_value", "--freeze amount must be greater than zero");
  if (days <= 0) throw new UsageError("invalid_value", "--freeze days must be greater than zero");
  return { frozen_amount: toSafeInteger(amount * scale, "--freeze"), frozen_days: days };
}

/** `YYYY-MM-DD` or `YYYY-MM-DD HH:mm:ss`, always read as UTC so it is reproducible anywhere. */
function parseUtcDateTime(value: string, flag: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?$/.exec(value.trim());
  if (!match) {
    throw new UsageError(
      "invalid_value",
      `${flag} must be YYYY-MM-DD or "YYYY-MM-DD HH:mm:ss" (read as UTC)`,
    );
  }
  const [, y, mo, d, h = "00", mi = "00", s = "00"] = match;
  const stamp = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  // Date.UTC rolls over out-of-range parts (month 13 → next January); reject rather than reinterpret.
  // Comparing the whole instant, not just the date: `12:60:00` rolls to 13:00:00 WITHIN the same
  // day, so a date-only check waves it through — and an issuance is irreversible.
  const iso = new Date(stamp).toISOString();
  if (iso.slice(0, 19) !== `${y}-${mo}-${d}T${h}:${mi}:${s}`) {
    throw new UsageError("invalid_value", `${flag} is not a real date and time`);
  }
  return stamp;
}

function requireVisibleAscii(value: string, flag: string): string {
  if (!VISIBLE_ASCII.test(value)) {
    throw new UsageError(
      "invalid_asset_name",
      `${flag} must be 1-32 visible ASCII characters, with no spaces`,
    );
  }
  return value;
}

function requireByteLength(
  value: string,
  max: number,
  flag: string,
  opts: { allowEmpty: boolean },
): string {
  const bytes = Buffer.byteLength(value, "utf8");
  if (!opts.allowEmpty && bytes === 0)
    throw new UsageError("invalid_value", `${flag} must not be empty`);
  if (bytes > max) throw new UsageError("invalid_value", `${flag} must be at most ${max} bytes`);
  return value;
}

function requirePositiveInteger(value: string, flag: string): bigint {
  if (!/^\d+$/.test(value.trim())) {
    throw new UsageError("invalid_value", `${flag} must be a whole number`);
  }
  const parsed = BigInt(value.trim());
  if (parsed <= 0n) throw new UsageError("invalid_value", `${flag} must be greater than zero`);
  return parsed;
}

/** protobuf int64 fields travel as JS numbers through tronweb; refuse anything that would lose
 *  precision rather than issue a token with a silently wrong supply. */
function toSafeInteger(value: bigint, flag: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new UsageError(
      "invalid_value",
      `${flag} is too large to represent exactly at this precision`,
    );
  }
  return Number(value);
}
