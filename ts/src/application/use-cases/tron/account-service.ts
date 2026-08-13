import type { ChainFamily, EffectiveTokenEntry, NetworkDescriptor } from "../../../domain/types/index.js";
import { ChainError, UsageError } from "../../../domain/errors/index.js";
import { FAMILIES } from "../../../domain/family/index.js";
import { fromBaseUnits } from "../../../domain/amounts/index.js";
import { TronAddress, tronHexToBase58 } from "../../../domain/address/index.js";
import type { AccountScope, TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronAccount, TronGateway } from "../../ports/chain/tron-gateway.js";
import type { TronHistoryQuery, TronHistoryReader } from "../../ports/chain/tron-history-reader.js";
import type { PriceProvider } from "../../ports/price-provider.js";
import type { TokenRepository } from "../../ports/token-repository.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import {
  outcomeData,
  transactionMode,
  transactionRequiresSigner,
  type TransactionModeInput,
} from "../../services/transaction-mode.js";
import { tronConfirmation } from "../../services/tron-confirmation.js";
import { tronTransactionHooks } from "./multisig-authorization.js";

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;
const ADDRESS = new TronAddress();

function holding(
  kind: string,
  symbol: string,
  decimals: number,
  raw: string,
  price: number | null,
  extra: Record<string, unknown> = {},
) {
  const balance = fromBaseUnits(raw, decimals);
  return {
    kind,
    symbol,
    decimals,
    rawBalance: raw,
    balance,
    priceUsd: price,
    valueUsd: price === null ? null : round6(Number(balance) * price),
    ...extra,
  };
}

/** degraded holding when a token balance could not be read; keeps the row (and its identity)
 *  but nulls the numeric fields and records why. Shape stays additive with holding(). */
function unavailableHolding(
  kind: string,
  symbol: string,
  decimals: number,
  extra: Record<string, unknown> = {},
) {
  return {
    kind,
    symbol,
    decimals,
    rawBalance: null,
    balance: null,
    priceUsd: null,
    valueUsd: null,
    balanceUnavailable: true,
    reason: "rpc_error",
    ...extra,
  };
}

export class TronAccountService {
  constructor(
    private readonly gateways: ChainGatewayProvider,
    private readonly history: TronHistoryReader,
    private readonly tokens: TokenRepository,
    private readonly prices: PriceProvider,
    private readonly pipeline: TxPipeline,
  ) {}

  async activate(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: TransactionModeInput & { address: string },
  ) {
    if (!ADDRESS.validate(input.address)) {
      throw new UsageError(
        "invalid_value",
        "--address must be a valid TRON address",
      );
    }
    if (transactionRequiresSigner(input)) {
      this.pipeline.assertCanSign(scope.activeAccount, "tron");
    }
    const mode = transactionMode(input);
    const gateway = this.gateways.get(network, "tron");
    const existing = await gateway.getAccount(input.address);
    if (accountExists(existing, input.address)) {
      throw new ChainError(
        "account_already_active",
        `TRON account is already active: ${input.address}`,
      );
    }
    const payer = scope.resolveAddress("tron");
    const [fee, balanceSun] = await Promise.all([
      accountCreateFee(gateway),
      gateway.getNativeBalance(payer),
    ]);
    if (
      (mode.mode === "dry-run" || mode.mode === "broadcast")
      && BigInt(balanceSun) < BigInt(fee.minimumFeeSun)
    ) {
      throw new ChainError(
        "insufficient_balance",
        "payer balance is below the account creation fees",
        { balance: balanceSun, required: fee.minimumFeeSun },
      );
    }
    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...mode,
      ...tronTransactionHooks(gateway),
      confirm: tronConfirmation(gateway, scope),
      build: (owner) => gateway.buildAccountCreate(owner, input.address),
      estimate: async () => ({ ...fee, balanceSun }),
    });
    if (outcome.stage === "confirmed" && !outcome.failed) {
      const activated = await gateway.getAccount(input.address);
      if (!accountExists(activated, input.address)) {
        throw new ChainError(
          "provider_error",
          "confirmed account activation is not visible from the selected node",
        );
      }
    }
    return {
      kind: "account-activate" as const,
      ...outcomeData(outcome),
      address: input.address,
      payer,
    };
  }

  async setOnChain(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: TransactionModeInput & { name?: string; id?: string },
  ) {
    if ((input.name === undefined) === (input.id === undefined)) {
      throw new UsageError(
        "invalid_option",
        "provide exactly one of --name or --id",
      );
    }
    if (transactionRequiresSigner(input)) {
      this.pipeline.assertCanSign(scope.activeAccount, "tron");
    }
    const field = input.name !== undefined ? "name" as const : "id" as const;
    const value = validateAccountText(field, input.name ?? input.id!);
    const address = scope.resolveAddress("tron");
    const gateway = this.gateways.get(network, "tron");
    const account = await gateway.getAccount(address);
    if (!accountExists(account, address)) {
      throw new ChainError(
        "not_found",
        `TRON account is not activated: ${address}`,
      );
    }
    const current =
      field === "name" ? account.account_name : account.account_id;
    if (accountTextIsSet(current, field)) {
      throw new ChainError(
        field === "name" ? "name_already_set" : "id_already_set",
        `on-chain account ${field} is already set`,
      );
    }
    if (field === "id") {
      const taken = await gateway.getAccountById(value);
      if (accountExists(taken)) {
        throw new ChainError(
          "id_taken",
          `account id is already in use: ${value}`,
        );
      }
    }
    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      ...tronTransactionHooks(gateway),
      confirm: tronConfirmation(gateway, scope),
      build: (owner) =>
        field === "name"
          ? gateway.buildAccountUpdate(owner, value)
          : gateway.buildSetAccountId(owner, value),
      estimate: async () => ({
        feeModel: "tron-resource",
        note: "account metadata update consumes bandwidth",
      }),
    });
    if (outcome.stage === "confirmed" && !outcome.failed) {
      const updated = await gateway.getAccount(address);
      const raw =
        field === "name" ? updated.account_name : updated.account_id;
      if (decodeAccountText(raw, field) !== value) {
        throw new ChainError(
          "provider_error",
          `confirmed account ${field} does not match the submitted value`,
        );
      }
    }
    return {
      kind: "account-set" as const,
      ...outcomeData(outcome),
      field,
      value,
      address,
    };
  }

  async balance(scope: AccountScope, network: NetworkDescriptor, family: ChainFamily) {
    const address = scope.resolveAddress(family);
    const meta = FAMILIES[family];
    return {
      address,
      balance: await this.gateways.client(network).getNativeBalance(address),
      decimals: meta.nativeDecimals,
      symbol: meta.nativeSymbol,
    };
  }

  async info(scope: AccountScope, network: NetworkDescriptor) {
    const address = scope.resolveAddress("tron");
    const gateway = this.gateways.get(network, "tron");
    const [account, resources] = await Promise.all([
      gateway.getAccount(address),
      gateway.getAccountResources(address),
    ]);
    const number = (value: unknown) => Number(value ?? 0);
    return {
      address,
      account,
      resources: {
        bandwidth: {
          used: number(resources.NetUsed) + number(resources.freeNetUsed),
          limit: number(resources.NetLimit) + number(resources.freeNetLimit),
        },
        energy: {
          used: number(resources.EnergyUsed),
          limit: number(resources.EnergyLimit),
        },
      },
    };
  }

  historyFor(scope: AccountScope, network: NetworkDescriptor, query: TronHistoryQuery) {
    return this.history.get(network, scope.resolveAddress("tron"), query);
  }

  async portfolio(scope: AccountScope, network: NetworkDescriptor) {
    const address = scope.resolveAddress("tron");
    const gateway = this.gateways.get(network, "tron");
    const tokens = this.tokens.effective(network.id, scope.activeAccount);
    const [nativeRaw, tokenBalances] = await Promise.all([
      gateway.getNativeBalance(address),
      // per-token best-effort: one unreadable token (delisted, bad contract, RPC hiccup) must not
      // sink the whole portfolio — degrade that row to balanceUnavailable instead.
      Promise.all(tokens.map((token) =>
        (token.kind === "trc10"
          ? gateway.getTrc10Balance(token.id, address)
          : gateway.getTrc20Balance(token.id, address)
        ).then((raw) => ({ raw }) as const)
          // best-effort: swallow the raw downstream error (may carry endpoint/key) — degrade to a
          // stable reason instead of leaking it into the success payload (audit I-06).
          .catch(() => ({ unavailable: true }) as const),
      )),
    ]);

    let priceUnavailable = false;
    let nativePrice: number | null = null;
    let tokenPrices = new Map<string, number | null>();
    try {
      [nativePrice, tokenPrices] = await Promise.all([
        this.prices.nativeUsd(network.id),
        this.prices.tokenUsd(
          network.id,
          tokens.filter((token) => token.kind === "trc20").map((token) => token.id),
        ),
      ]);
    } catch {
      // swallow the raw price-provider error (may carry a keyed URL); surface a stable reason only.
      priceUnavailable = true;
    }

    const nativeMeta = FAMILIES.tron;
    const holdings: Array<Record<string, unknown>> = [
      holding("native", nativeMeta.nativeSymbol, nativeMeta.nativeDecimals, nativeRaw, nativePrice),
      ...tokens.map((token: EffectiveTokenEntry, index) => {
        const result = tokenBalances[index]!;
        const extra = { id: token.id, name: token.name, source: token.source };
        if ("unavailable" in result) {
          return unavailableHolding(token.kind, token.symbol, token.decimals, extra);
        }
        return holding(
          token.kind,
          token.symbol,
          token.decimals,
          result.raw,
          token.kind === "trc20" ? tokenPrices.get(token.id) ?? null : null,
          extra,
        );
      }),
    ];
    const values = holdings
      .map((item) => item.valueUsd)
      .filter((value): value is number => typeof value === "number");
    return {
      network: network.id,
      account: scope.activeAccount,
      address,
      priceSource: this.prices.source,
      ...(priceUnavailable ? { priceUnavailable: true, priceReason: "price_provider_error" } : {}),
      holdings,
      totalValueUsd: values.length ? round6(values.reduce((sum, value) => sum + value, 0)) : null,
    };
  }
}

async function accountCreateFee(gateway: TronGateway) {
  const parameters = await gateway.getChainParameters();
  const find = (key: string): bigint => {
    const value = parameters.find((entry) => entry.key === key)?.value;
    if (!Number.isSafeInteger(value) || value! < 0) {
      throw new ChainError(
        "provider_error",
        `chain parameter is unavailable: ${key}`,
      );
    }
    return BigInt(value!);
  };
  const createAccountFeeSun = find("getCreateAccountFee");
  const systemContractFeeSun = find(
    "getCreateNewAccountFeeInSystemContract",
  );
  return {
    feeModel: "tron-resource" as const,
    createAccountFeeSun: createAccountFeeSun.toString(),
    systemContractFeeSun: systemContractFeeSun.toString(),
    minimumFeeSun: (createAccountFeeSun + systemContractFeeSun).toString(),
  };
}

function validateAccountText(field: "name" | "id", input: string): string {
  const bytes = Buffer.byteLength(input, "utf8");
  const minimum = field === "id" ? 8 : 1;
  if (
    bytes < minimum
    || bytes > 32
    || /[\p{Cc}\p{Cf}]/u.test(input)
  ) {
    throw new UsageError(
      "invalid_value",
      field === "id"
        ? "--id must be 8-32 safe UTF-8 bytes"
        : "--name must be 1-32 safe UTF-8 bytes",
    );
  }
  return input;
}

function accountExists(account: TronAccount, expected?: string): boolean {
  const raw = account.address;
  if (raw === undefined || raw === null || raw === "") return false;
  if (typeof raw !== "string") {
    throw new ChainError(
      "provider_error",
      "TRON node returned a malformed account address",
    );
  }
  const normalized = tronHexToBase58(raw);
  if (!ADDRESS.validate(normalized)) {
    throw new ChainError(
      "provider_error",
      "TRON node returned an invalid account address",
    );
  }
  if (expected !== undefined && normalized !== expected) {
    throw new ChainError(
      "provider_error",
      "TRON node returned an account address different from the query",
    );
  }
  return true;
}

function accountTextIsSet(
  value: unknown,
  field: "name" | "id",
): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (typeof value !== "string") {
    throw new ChainError(
      "provider_error",
      `TRON node returned malformed account_${field}`,
    );
  }
  return true;
}

function decodeAccountText(
  value: unknown,
  field: "name" | "id",
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (
    typeof value !== "string"
    || !/^(?:[0-9a-fA-F]{2})+$/.test(value)
  ) {
    throw new ChainError(
      "provider_error",
      `TRON node returned malformed account_${field}`,
    );
  }
  const decoded = Buffer.from(value, "hex").toString("utf8");
  if (Buffer.from(decoded, "utf8").toString("hex") !== value.toLowerCase()) {
    throw new ChainError(
      "provider_error",
      `TRON node returned invalid UTF-8 account_${field}`,
    );
  }
  return decoded;
}
