/**
 * TronRpcClient — thin TRON node wrapper via tronweb HTTP fullHost. Implements the
 * Broadcaster port plus TRON-specific reads, TRC10/TRC20, Stake 2.0, and contract operations.
 * (builtin TRON networks carry an HTTP fullHost; tronweb is HTTP-based.)
 */
import { TronWeb } from "tronweb";
import type { Types } from "tronweb";
import { isLosslessNumber, parse as parseLosslessJson } from "lossless-json";
import type {
  AccountPermissionsView,
  ActivePermissionView,
  BroadcastResult,
  PermissionGroupView,
  SignedTx,
  TronTransactionArtifact,
  UnsignedTx,
} from "../../../../domain/types/index.js";
import type { RpcResourceCode } from "../../../../domain/resources/index.js";
import type { Broadcaster } from "../../../../application/ports/chain/broadcaster.js";
import type {
  DecodedTronTransaction,
  TronContractParameter,
  TronContractMetadata,
  TronAccount,
  TronDelegatedResource,
  TronGateway,
  TronNodeInfo,
  TronSignWeight,
  TronTokenInfo,
  TronTx,
  TronTxInfo,
  TronVote,
  TronWitness,
} from "../../../../application/ports/chain/tron-gateway.js";
import { ChainError, TransportError, UsageError } from "../../../../domain/errors/index.js";
import { redactErrorMessage } from "../../../../domain/errors/redact.js";
import { withTimeout } from "../../../../domain/async/index.js";
import { tronHexToBase58 } from "../../../../domain/address/index.js";
import { parseTronTx, parseTronTxInfo } from "./tron-responses.js";
import { assertBuiltTx } from "./tx-guard.js";
import { decodeTronTransaction } from "./transaction-decoder.js";
import { normalizeContractResponses } from "./contract-response.js";
import {
  decodeTransactionHex,
  encodeTransactionHex,
  normalizeTransactionHex,
  refreshTransactionIdentity,
} from "./transaction-codec.js";
import { decodeOperations } from "../../../../domain/permission/index.js";
import { addressCodec } from "../../../../domain/family/index.js";

/** a valid base58 owner used as the caller for read-only (constant) contract calls. */
const TRON_READ_OWNER = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
const DEFAULT_ACTIVE_OPERATIONS = "7fff1fc0033ef30f000000000000000000000000000000000000000000000000";

/** 41-prefixed hex TRON address → base58; passes through values that are already base58/empty.
 *  TronGrid's native /transactions endpoint returns hex even with visible=true. */
export function hexToBase58(addr: unknown): string {
  return tronHexToBase58(addr);
}

export class TronRpcClient implements TronGateway, Broadcaster {
  #tw: InstanceType<typeof TronWeb>;
  readonly #fullHost: string;
  readonly #timeoutMs: number;
  constructor(fullHost: string, timeoutMs = 60_000) {
    // a dummy address keeps tronweb happy for read-only/builder use (no key → cannot sign)
    this.#tw = new TronWeb({ fullHost });
    this.#fullHost = fullHost.replace(/\/+$/, "");
    this.#timeoutMs = timeoutMs;
    this.#tw.setAddress(TRON_READ_OWNER);
  }
  get tronweb(): InstanceType<typeof TronWeb> {
    return this.#tw;
  }
  async getNativeBalance(address: string): Promise<string> {
    const account = await this.getAccount(address);
    return account.balance ?? "0";
  }
  async broadcast(signed: SignedTx): Promise<BroadcastResult> {
    let res: Types.BroadcastReturn<Types.SignedTransaction>;
    try {
      // bound the RPC so a standalone `tx broadcast` (not routed through the pipeline) can't hang.
      res = await withTimeout(
        this.#tw.trx.sendRawTransaction(signed as Types.SignedTransaction),
        this.#timeoutMs,
        () => {},
      );
    } catch (e) {
      if (e instanceof ChainError) throw e; // preserve timeout as ChainError, don't remap to rpc_error
      throw new TransportError("rpc_error", `TRON broadcast failed: ${redactErrorMessage((e as Error).message ?? "")}`);
    }
    // tronweb does NOT throw on node rejection — it returns { result:false, code, message }.
    if (res.result === false) {
      const reason = decodeTronMessage(res.message) || res.code || "rejected by node";
      throw new ChainError("transaction_rejected", `TRON broadcast rejected: ${redactErrorMessage(String(reason))}`, { code: res.code });
    }
    return { txId: res.txid ?? res.transaction?.txID };
  }

  prepareTransaction(
    transaction: UnsignedTx,
    options: { permissionId: number; expiration?: number },
  ): TronTransactionArtifact {
    if (!transaction || typeof transaction !== "object") {
      throw new ChainError("invalid_transaction", "TRON builder returned a non-object transaction");
    }
    const prepared = structuredClone(transaction) as TronTransactionArtifact;
    if (Array.isArray(prepared.signature) && prepared.signature.length > 0) {
      throw new ChainError("invalid_transaction", "cannot prepare a transaction that is already signed");
    }
    const contracts = prepared.raw_data?.contract;
    if (!Array.isArray(contracts) || contracts.length !== 1) {
      throw new ChainError("invalid_transaction", "exactly one TRON contract is required");
    }
    if (options.permissionId === 0) delete contracts[0]!.Permission_id;
    else contracts[0]!.Permission_id = options.permissionId;
    if (options.expiration !== undefined) {
      const timestamp = prepared.raw_data.timestamp;
      if (!Number.isSafeInteger(timestamp)) {
        throw new ChainError("invalid_transaction", "TRON transaction timestamp is missing or imprecise");
      }
      const expiration = timestamp! + options.expiration;
      if (!Number.isSafeInteger(expiration)) {
        throw new ChainError("invalid_transaction", "TRON transaction expiration is imprecise");
      }
      prepared.raw_data.expiration = expiration;
    }
    return refreshTransactionIdentity(prepared);
  }

  encodeTransactionHex(transaction: UnsignedTx): string {
    return encodeTransactionHex(transaction);
  }

  decodeTransactionHex(hex: string): TronTransactionArtifact {
    return decodeTransactionHex(hex);
  }

  async getAccountPermissions(address: string): Promise<AccountPermissionsView> {
    const account = await this.getAccount(address);
    const returnedAddress = hexToBase58(account.address);
    if (!returnedAddress) {
      throw new ChainError("not_found", `TRON account is not activated: ${address}`);
    }
    if (returnedAddress !== address) {
      throw new ChainError("provider_error", "TRON node returned permissions for a different account");
    }
    const ownerRaw = account.owner_permission;
    const activeRaw = account.active_permission;
    if (!ownerRaw && activeRaw === undefined) {
      const decoded = decodeOperations(DEFAULT_ACTIVE_OPERATIONS);
      const defaultGroup = (id: number, name: string): PermissionGroupView => ({
        id,
        name,
        threshold: 1,
        keys: [{ address, weight: 1, local: null }],
      });
      const isWitness = account.is_witness === true || account.isWitness === true;
      return {
        address,
        owner: defaultGroup(0, "owner"),
        witness: isWitness ? defaultGroup(1, "witness") : null,
        actives: [{
          ...defaultGroup(2, "active"),
          operations: decoded.operations,
          operationLabels: decoded.labels,
          operationsHex: decoded.operationsHex,
          unknownOperationIds: decoded.unknownOperationIds,
        }],
      };
    }
    if (!ownerRaw) {
      throw new ChainError("provider_error", "TRON node response is missing owner_permission");
    }
    if (activeRaw !== undefined && !Array.isArray(activeRaw)) {
      throw new ChainError("provider_error", "TRON node returned malformed active_permission data");
    }
    if ((activeRaw?.length ?? 0) > 8) {
      throw new ChainError("provider_error", "TRON node returned more than 8 active permissions");
    }
    const owner = permissionGroupFromNode(ownerRaw, "owner", 0, { expectedId: 0 });
    const witness = account.witness_permission
      ? permissionGroupFromNode(account.witness_permission, "witness", 1, { expectedId: 1, exactKeys: 1 })
      : null;
    const actives = (activeRaw ?? []).map((permission, index) => activePermissionFromNode(permission, index));
    if (new Set(actives.map((permission) => permission.id)).size !== actives.length) {
      throw new ChainError("provider_error", "TRON node returned duplicate active permission ids");
    }
    return { address, owner, witness, actives };
  }

  async buildAccountPermissionUpdate(owner: string, permissions: AccountPermissionsView): Promise<UnsignedTx> {
    const toPermission = (permission: PermissionGroupView, type: number): Types.Permission => ({
      type,
      id: permission.id,
      permission_name: permission.name,
      threshold: permission.threshold,
      keys: permission.keys.map((key) => ({ address: key.address, weight: key.weight })),
    });
    const ownerPermission = toPermission(permissions.owner, 0);
    const witnessPermission = permissions.witness ? toPermission(permissions.witness, 1) : null;
    const actives = permissions.actives.map((permission): Types.Permission => ({
      ...toPermission(permission, 2),
      operations: permission.operationsHex,
    }));
    return this.#wrap("update account permissions", async () =>
      assertBuiltTx(
        await this.#tw.transactionBuilder.updateAccountPermissions(
          owner,
          ownerPermission,
          witnessPermission,
          actives,
        ),
        "AccountPermissionUpdateContract",
      ),
    );
  }

  async getSignWeight(transaction: UnsignedTx): Promise<TronSignWeight> {
    return this.#wrap("getSignWeight", async () => {
      // TronWeb mutates Permission_id when absent; never expose the caller's artifact by reference.
      const response = await this.#tw.trx.getSignWeight(structuredClone(transaction) as Types.Transaction);
      const permission = response.permission
        ? permissionGroupFromNode(response.permission, "permission", Number(response.permission.id ?? 0))
        : null;
      return {
        permission: permission ? {
          id: permission.id,
          name: permission.name,
          threshold: permission.threshold,
          operationsHex: typeof response.permission.operations === "string"
            ? response.permission.operations.toLowerCase()
            : undefined,
          keys: permission.keys.map(({ address: keyAddress, weight }) => ({ address: keyAddress, weight })),
        } : null,
        approvedList: (response.approved_list ?? []).map(hexToBase58),
        currentWeight: safeNodeInteger(response.current_weight, "current_weight"),
        resultCode: String(response.result?.code ?? ""),
        message: decodeTronMessage(response.result?.message),
      };
    });
  }

  async getApprovedList(transaction: UnsignedTx): Promise<string[]> {
    return this.#wrap("getApprovedList", async () => {
      const response = await this.#tw.trx.getApprovedList(structuredClone(transaction) as Types.Transaction);
      return (response.approved_list ?? []).map(hexToBase58);
    });
  }

  async broadcastHex(input: string): Promise<BroadcastResult> {
    const hex = normalizeTransactionHex(input);
    decodeTransactionHex(hex);
    const response = await this.#wrap("broadcast hex", () => this.#tw.trx.sendHexTransaction(hex));
    if (response.result === false) {
      const reason = decodeTronMessage(response.message) || response.code || "rejected by node";
      throw new ChainError("transaction_rejected", `TRON broadcast rejected: ${redactErrorMessage(String(reason))}`);
    }
    const returnedTxId = response.transaction && typeof response.transaction === "object"
      ? response.transaction.txID
      : undefined;
    return { txId: response.txid ?? returnedTxId };
  }

  async getUpdateAccountPermissionFee(): Promise<number> {
    return this.#chainParameter("getUpdateAccountPermissionFee");
  }

  async getMultiSignFee(): Promise<number> {
    return this.#chainParameter("getMultiSignFee");
  }

  async #chainParameter(key: string): Promise<number> {
    const parameter = (await this.getChainParameters()).find((entry) => entry.key === key);
    if (parameter?.value === undefined) {
      throw new ChainError("provider_error", `TRON chain parameter is unavailable: ${key}`);
    }
    return safeNodeInteger(parameter.value, key);
  }

  /** build an unsigned TRX transfer (tronweb fills ref block etc.). */
  async buildNativeTransfer(from: string, to: string, amountSun: string): Promise<Types.Transaction> {
    // tronweb's sendTrx amount param is a JS number; guard before #wrap so a precision-losing
    // amount surfaces as invalid_amount, and a node failure as rpc_error (not a redacted internal_error).
    const n = this.#safeNumber(amountSun);
    return this.#wrap("build native transfer", async () =>
      assertBuiltTx(await this.#tw.transactionBuilder.sendTrx(to, n, from), "TransferContract"),
    );
  }

  async buildAccountCreate(owner: string, target: string): Promise<UnsignedTx> {
    return this.#localAccountTransaction("AccountCreateContract", owner, {
      owner_address: this.#tw.address.toHex(owner),
      account_address: this.#tw.address.toHex(target),
    });
  }

  async buildAccountUpdate(owner: string, accountName: string): Promise<UnsignedTx> {
    return this.#localAccountTransaction("AccountUpdateContract", owner, {
      owner_address: this.#tw.address.toHex(owner),
      account_name: Buffer.from(accountName, "utf8").toString("hex"),
    });
  }

  async buildSetAccountId(owner: string, accountId: string): Promise<UnsignedTx> {
    // TronWeb 6.4 applies the 8..32 bound to the encoded hex string length, not the decoded
    // UTF-8 byte length. Build the identical protobuf locally so valid 17..32-byte ids survive.
    return this.#localAccountTransaction("SetAccountIdContract", owner, {
      owner_address: this.#tw.address.toHex(owner),
      account_id: Buffer.from(accountId, "utf8").toString("hex"),
    });
  }

  async #localAccountTransaction(
    type: "AccountCreateContract" | "AccountUpdateContract" | "SetAccountIdContract",
    owner: string,
    value: Record<string, unknown>,
  ): Promise<UnsignedTx> {
    return this.#wrap(`build ${type}`, async () => {
      const block = await this.#tw.trx.getCurrentRefBlockParams();
      const transaction = refreshTransactionIdentity({
        visible: false,
        txID: "",
        raw_data_hex: "",
        raw_data: {
          contract: [{
            parameter: {
              value,
              type_url: `type.googleapis.com/protocol.${type}`,
            },
            type,
          }],
          ...block,
        },
      });
      const contract = transaction.raw_data.contract[0]?.parameter?.value;
      const matchesIntent = Object.entries(value).every(
        ([key, expected]) => contract?.[key] === expected,
      );
      if (!matchesIntent) {
        throw new ChainError(
          "tx_integrity",
          `locally built ${type} fields do not match the requested operation`,
        );
      }
      return assertBuiltTx(transaction, type);
    });
  }

  // ── generic error wrapper for node reads/builds ──────────────────────────────
  // Timeout wraps the guard (not the reverse) so a timed-out call surfaces as ChainError("timeout")
  // rather than being remapped to a generic rpc_error by the catch below.
  #wrap<T>(label: string, fn: () => Promise<T>): Promise<T> {
    return withTimeout(this.#guard(label, fn), this.#timeoutMs, () => {});
  }
  async #guard<T>(label: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ChainError || e instanceof UsageError || e instanceof TransportError) throw e;
      throw new TransportError("rpc_error", `TRON ${label} failed: ${redactErrorMessage((e as Error).message?.split("\n")[0] ?? "")}`);
    }
  }

  // ── account / query ──────────────────────────────────────────────────────────
  async getAccount(address: string): Promise<TronAccount> {
    return this.#wrap("getAccount", async () => {
      const response = await fetch(`${this.#fullHost}/wallet/getaccount`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: this.#tw.address.toHex(address) }),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return parseTronAccountResponse(await response.text());
    });
  }
  async getAccountById(accountId: string): Promise<TronAccount> {
    return this.#wrap("getAccountById", async () => {
      const response = await fetch(`${this.#fullHost}/wallet/getaccountbyid`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          account_id: Buffer.from(accountId, "utf8").toString("hex"),
        }),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return parseTronAccountResponse(await response.text());
    });
  }
  async getAccountResources(address: string): Promise<Types.AccountResourceMessage> {
    return this.#wrap("getAccountResources", () => this.#tw.trx.getAccountResources(address));
  }
  async getBlock(numberOrLatest?: string): Promise<Types.Block> {
    // Guard before #wrap so a bad height surfaces as invalid_amount, not a wrapped rpc_error.
    const height = numberOrLatest === undefined ? undefined : this.#safeNumber(numberOrLatest, "block number");
    return this.#wrap("getBlock", () =>
      height === undefined ? this.#tw.trx.getCurrentBlock() : this.#tw.trx.getBlockByNumber(height),
    );
  }
  async getTransactionById(txid: string): Promise<TronTx> {
    return this.#wrap("getTransaction", async () => parseTronTx(await this.#tw.trx.getTransaction(txid)));
  }
  async getTransactionInfoById(txid: string): Promise<TronTxInfo> {
    // Full-node (unconfirmed) info: available ~one block after inclusion (~3s), not after
    // solidification (~19 blocks / ~60s). So `--wait` confirms at "mined in a block" rather than
    // "irreversible" — the receipt (fee/energy/result) is already final by then. Same response shape.
    return this.#wrap("getTransactionInfo", async () => parseTronTxInfo(await this.#tw.trx.getUnconfirmedTransactionInfo(txid)));
  }
  decodeTransaction(transaction: TronTx): DecodedTronTransaction {
    return decodeTronTransaction(transaction);
  }

  // ── TRC20 / TRC10 ──────────────────────────────────────────────────────────────
  async #constant(
    contract: string, fn: string, params: Types.ContractFunctionParameter[], owner = TRON_READ_OWNER,
  ): Promise<string[]> {
    const res = await this.#tw.transactionBuilder.triggerConstantContract(contract, fn, {}, params, owner);
    if (res.result?.result !== true) {
      const reason = decodeTronMessage(res.result?.message) || "constant call reverted";
      throw new ChainError("execution_error", `TRON ${fn} failed: ${redactErrorMessage(reason)}`);
    }
    return (res.constant_result ?? []) as string[];
  }

  async getTrc20Balance(contract: string, address: string): Promise<string> {
    return this.#wrap("trc20 balanceOf", async () => {
      const [hex] = await this.#constant(contract, "balanceOf(address)", [{ type: "address", value: address }]);
      return hex ? BigInt("0x" + hex).toString() : "0";
    });
  }

  async getTokenInfo(contract: string): Promise<TronTokenInfo> {
    return this.#wrap("trc20 tokenInfo", async () => {
      const c = await this.#tw.contract().at(contract);
      const [name, symbol, decimals, totalSupply] = await Promise.all([
        c.name().call().catch(() => undefined),
        c.symbol().call().catch(() => undefined),
        c.decimals().call().catch(() => undefined),
        c.totalSupply().call().catch(() => undefined),
      ]);
      return {
        contract,
        name: name?.toString?.() ?? name,
        symbol: symbol?.toString?.() ?? symbol,
        decimals: decimals !== undefined ? Number(decimals) : undefined,
        totalSupply: totalSupply !== undefined ? BigInt(totalSupply.toString()).toString() : undefined,
      };
    });
  }

  async getTrc10Balance(assetId: string, address: string): Promise<string> {
    return this.#wrap("trc10 balance", async () => {
      const acct = await this.getAccount(address);
      const entry = (acct.assetV2 ?? []).find((a) => String(a.key) === String(assetId));
      return entry?.value ?? "0";
    });
  }
  async getTrc10Info(assetId: string): Promise<TronTokenInfo> {
    return this.#wrap("trc10 info", async () =>
      await this.#tw.trx.getTokenFromID(assetId) as unknown as TronTokenInfo,
    );
  }

  async buildTrc20Transfer(from: string, to: string, contract: string, amount: string, feeLimit: string): Promise<Types.Transaction> {
    const fee = this.#safeNumber(feeLimit, "fee limit"); // guard before #wrap → invalid_amount, not rpc_error
    return this.#wrap("build trc20 transfer", async () => {
      // txLocal: build & ABI-encode the call locally so the node never supplies the calldata.
      const { transaction } = await this.#tw.transactionBuilder.triggerSmartContract(
        contract,
        "transfer(address,uint256)",
        { feeLimit: fee, txLocal: true },
        [{ type: "address", value: to }, { type: "uint256", value: amount }],
        from,
      );
      return assertBuiltTx(transaction, "TriggerSmartContract");
    });
  }
  async buildTrc10Transfer(from: string, to: string, assetId: string, amount: string): Promise<Types.Transaction> {
    const n = this.#safeNumber(amount);
    return this.#wrap("build trc10 transfer", async () =>
      assertBuiltTx(await this.#tw.transactionBuilder.sendToken(to, n, assetId, from), "TransferAssetContract"),
    );
  }

  // ── estimate (real fee report for --dry-run) ─────────────────────────────────
  async estimateEnergy(from: string, contract: string, fn: string, params: TronContractParameter[]): Promise<number> {
    return this.#wrap("estimateEnergy", async () => {
      const res = await this.#tw.transactionBuilder.triggerConstantContract(contract, fn, {}, params as Types.ContractFunctionParameter[], from);
      return Number(res.energy_used ?? res.energy_required ?? 0);
    });
  }
  async estimateResources(from: string, contract: string, fn: string, params: TronContractParameter[]): Promise<FeeEstimate> {
    const [energy, prices, resources] = await Promise.all([
      this.estimateEnergy(from, contract, fn, params),
      this.getEnergyPrices().catch(() => undefined),
      this.getAccountResources(from).catch(() => undefined),
    ]);
    return {
      feeModel: "tron-resource",
      energy,
      energyPriceSun: prices,
      availableEnergy: resources ? Number(resources.EnergyLimit ?? 0) - Number(resources.EnergyUsed ?? 0) : undefined,
    };
  }

  // ── staking (Stake 2.0) ──────────────────────────────────────────────────────
  async buildFreezeV2(owner: string, amountSun: string, resource: RpcResourceCode): Promise<Types.Transaction> {
    const n = this.#safeNumber(amountSun);
    return this.#wrap("freezeBalanceV2", async () =>
      assertBuiltTx(await this.#tw.transactionBuilder.freezeBalanceV2(n, resource, owner), "FreezeBalanceV2Contract"),
    );
  }
  async buildUnfreezeV2(owner: string, amountSun: string, resource: RpcResourceCode): Promise<Types.Transaction> {
    const n = this.#safeNumber(amountSun);
    return this.#wrap("unfreezeBalanceV2", async () =>
      assertBuiltTx(await this.#tw.transactionBuilder.unfreezeBalanceV2(n, resource, owner), "UnfreezeBalanceV2Contract"),
    );
  }
  async buildWithdrawExpireUnfreeze(owner: string): Promise<Types.Transaction> {
    return this.#wrap("withdrawExpireUnfreeze", async () =>
      assertBuiltTx(await this.#tw.transactionBuilder.withdrawExpireUnfreeze(owner), "WithdrawExpireUnfreezeContract"),
    );
  }
  async buildCancelAllUnfreezeV2(owner: string): Promise<Types.Transaction> {
    return this.#wrap("cancelUnfreezeBalanceV2", async () =>
      assertBuiltTx(await this.#tw.transactionBuilder.cancelUnfreezeBalanceV2(owner), "CancelAllUnfreezeV2Contract"),
    );
  }
  async buildDelegateResource(
    owner: string, amountSun: string, resource: RpcResourceCode,
    receiver: string, lock: boolean, lockPeriod?: string,
  ): Promise<Types.Transaction> {
    const n = this.#safeNumber(amountSun);
    const lockBlocks = lockPeriod === undefined ? undefined : this.#safeNumber(lockPeriod, "lock period");
    return this.#wrap("delegateResource", async () =>
      assertBuiltTx(await this.#tw.transactionBuilder.delegateResource(n, receiver, resource, owner, lock, lockBlocks), "DelegateResourceContract"),
    );
  }
  async buildUndelegateResource(
    owner: string, amountSun: string, resource: RpcResourceCode, receiver: string,
  ): Promise<Types.Transaction> {
    const n = this.#safeNumber(amountSun);
    return this.#wrap("undelegateResource", async () =>
      assertBuiltTx(await this.#tw.transactionBuilder.undelegateResource(n, receiver, resource, owner), "UnDelegateResourceContract"),
    );
  }

  // ── voting / witnesses ─────────────────────────────────────────────────────
  async buildVoteWitness(owner: string, votes: TronVote[]): Promise<Types.Transaction> {
    const voteInfo = Object.fromEntries(
      votes.map((vote) => [vote.witness, this.#safeNumber(vote.count, "vote count")]),
    );
    return this.#wrap("voteWitness", async () =>
      assertBuiltTx(await this.#tw.transactionBuilder.vote(voteInfo, owner), "VoteWitnessContract"),
    );
  }
  async buildWithdrawBalance(owner: string): Promise<Types.Transaction> {
    return this.#wrap("withdrawBlockRewards", async () =>
      assertBuiltTx(await this.#tw.transactionBuilder.withdrawBlockRewards(owner), "WithdrawBalanceContract"),
    );
  }
  async getWitnesses(limit: number): Promise<TronWitness[]> {
    const capped = Math.min(Math.max(Math.trunc(limit), 1), 127);
    return this.#wrap("getNowWitnessList", async () => {
      const response = await fetch(`${this.#fullHost}/wallet/getpaginatednowwitnesslist`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ offset: 0, limit: capped, visible: true }),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const raw = normalizeAccountValue(parseLosslessJson(await response.text())) as Record<string, unknown>;
      const witnesses = Array.isArray(raw.witnesses) ? raw.witnesses : [];
      return witnesses.map(normalizeWitness).filter((w): w is TronWitness => w !== null);
    });
  }
  async getBrokerage(address: string): Promise<number> {
    return this.#wrap("getBrokerage", async () => {
      const response = await fetch(`${this.#fullHost}/wallet/getBrokerage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: this.#tw.address.toHex(address) }),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const raw = normalizeAccountValue(parseLosslessJson(await response.text())) as Record<string, unknown>;
      if (raw.brokerage === undefined) throw new Error("brokerage not found");
      const brokerage = Number(raw.brokerage);
      return Number.isFinite(brokerage) ? brokerage : 0;
    });
  }
  async getReward(address: string): Promise<string> {
    return this.#wrap("getReward", async () => {
      const response = await fetch(`${this.#fullHost}/wallet/getReward`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: this.#tw.address.toHex(address) }),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const raw = normalizeAccountValue(parseLosslessJson(await response.text())) as Record<string, unknown>;
      return quantityString(raw.reward);
    });
  }

  // ── prices ─────────────────────────────────────────────────────────────────────
  async getEnergyPrices(): Promise<string> {
    return this.#wrap("getEnergyPrices", () => this.#tw.trx.getEnergyPrices());
  }
  async getBandwidthPrices(): Promise<string> {
    return this.#wrap("getBandwidthPrices", () => this.#tw.trx.getBandwidthPrices());
  }

  // ── chain info ────────────────────────────────────────────────────────────────
  async getChainParameters(): Promise<Array<{ key: string; value?: number }>> {
    return this.#wrap("getChainParameters", () => this.#tw.trx.getChainParameters());
  }
  async getNodeInfo(): Promise<TronNodeInfo> {
    return this.#wrap("getNodeInfo", () => this.#tw.trx.getNodeInfo() as Promise<TronNodeInfo>);
  }

  // ── staking queries (Stake 2.0) ───────────────────────────────────────────────
  async getDelegatedResourceV2(from: string, to: string): Promise<TronDelegatedResource[]> {
    return this.#wrap("getDelegatedResourceV2", async () => {
      const res = await this.#tw.trx.getDelegatedResourceV2(from, to);
      return (res.delegatedResource ?? []).map((d) => ({
        from: tronHexToBase58(d.from),
        to: tronHexToBase58(d.to),
        balanceForEnergySun: String(d.frozen_balance_for_energy ?? 0),
        balanceForBandwidthSun: String(d.frozen_balance_for_bandwidth ?? 0),
        expireTimeForEnergy: d.expire_time_for_energy ? Number(d.expire_time_for_energy) : null,
        expireTimeForBandwidth: d.expire_time_for_bandwidth ? Number(d.expire_time_for_bandwidth) : null,
      }));
    });
  }
  async getDelegatedIndexV2(address: string): Promise<{ fromAccounts: string[]; toAccounts: string[] }> {
    return this.#wrap("getDelegatedResourceAccountIndexV2", async () => {
      const res = await this.#tw.trx.getDelegatedResourceAccountIndexV2(address);
      return {
        fromAccounts: (res.fromAccounts ?? []).map((a) => tronHexToBase58(a)),
        toAccounts: (res.toAccounts ?? []).map((a) => tronHexToBase58(a)),
      };
    });
  }
  async getCanDelegatedMaxSize(address: string, resource: RpcResourceCode): Promise<string> {
    return this.#wrap("getCanDelegatedMaxSize", async () =>
      String((await this.#tw.trx.getCanDelegatedMaxSize(address, resource)).max_size ?? 0),
    );
  }
  async getCanWithdrawUnfreezeAmount(address: string): Promise<string> {
    return this.#wrap("getCanWithdrawUnfreezeAmount", async () =>
      String((await this.#tw.trx.getCanWithdrawUnfreezeAmount(address)).amount ?? 0),
    );
  }
  async getAvailableUnfreezeCount(address: string): Promise<number> {
    return this.#wrap("getAvailableUnfreezeCount", async () =>
      Number((await this.#tw.trx.getAvailableUnfreezeCount(address)).count ?? 0),
    );
  }

  // ── contract ──────────────────────────────────────────────────────────────────
  async triggerConstantContract(
    contract: string, fn: string, params: TronContractParameter[], owner = TRON_READ_OWNER,
  ): Promise<string[]> {
    return this.#wrap("triggerConstantContract", () => this.#constant(contract, fn, params as Types.ContractFunctionParameter[], owner));
  }
  async triggerSmartContract(
    from: string,
    contract: string,
    fn: string,
    params: TronContractParameter[],
    opts: { feeLimit?: string; callValue?: string } = {},
  ): Promise<Types.Transaction> {
    // Guard before #wrap so a bad fee/callValue surfaces as invalid_amount, not a wrapped rpc_error.
    const feeLimit = opts.feeLimit === undefined ? undefined : this.#safeNumber(opts.feeLimit, "fee limit");
    const callValue = opts.callValue === undefined ? undefined : this.#safeNumber(opts.callValue, "call value");
    return this.#wrap("triggerSmartContract", async () => {
      // txLocal: ABI-encode the call client-side so the node never supplies the calldata/params.
      const { transaction } = await this.#tw.transactionBuilder.triggerSmartContract(
        contract,
        fn,
        { feeLimit, callValue, txLocal: true },
        params as Types.ContractFunctionParameter[],
        from,
      );
      return assertBuiltTx(transaction, "TriggerSmartContract");
    });
  }
  async deployContract(
    from: string,
    p: { abi: unknown; bytecode: string; feeLimit: string; parameters?: unknown[] },
  ): Promise<Types.Transaction> {
    const feeLimit = this.#safeNumber(p.feeLimit, "fee limit"); // guard before #wrap → invalid_amount, not rpc_error
    return this.#wrap("createSmartContract", async () =>
      assertBuiltTx(
        await this.#tw.transactionBuilder.createSmartContract(
          { abi: p.abi as Types.CreateSmartContractOptions["abi"], bytecode: p.bytecode, feeLimit, parameters: p.parameters },
          from,
        ),
        "CreateSmartContract",
      ),
    );
  }
  async getContract(address: string): Promise<unknown> {
    return this.#wrap("getContract", () => this.#tw.trx.getContract(address));
  }
  async getContractInfo(address: string): Promise<unknown> {
    return this.#wrap("getContractInfo", () => this.#tw.trx.getContractInfo(address));
  }
  async getContractMetadata(address: string): Promise<TronContractMetadata> {
    const [contract, info] = await Promise.all([
      this.getContract(address),
      this.getContractInfo(address).catch(() => undefined),
    ]);
    return normalizeContractResponses(contract, info);
  }

  // tronweb's builder params are JS numbers; strings stay exact until this last inch,
  // where we reject any value that a Number could not represent without precision loss.
  #safeNumber(value: string, label = "amount"): number {
    const n = BigInt(value);
    if (n > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new UsageError("invalid_amount", `${label} ${value} exceeds the safe-integer limit for this client`);
    }
    return Number(n);
  }
}

const ACCOUNT_QUANTITY_KEYS = new Set([
  "amount",
  "allowance",
  "balance",
  "frozen_amount",
  "frozen_balance",
  "latest_withdraw_time",
  "reward",
  "total_supply",
  "unfreeze_amount",
  "value",
  "vote_count",
  "voteCount",
]);

function quantityString(value: unknown): string {
  if (typeof value === "bigint") return value >= 0n ? value.toString() : "0";
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? String(value) : "0";
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  return "0";
}

function optionalNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function decodeAsciiHex(value: unknown): string | undefined {
  const raw = String(value ?? "");
  const hex = raw.replace(/^0x/, "");
  if (!hex || !/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return raw || undefined;
  try {
    const text = Buffer.from(hex, "hex").toString("utf8").replace(/\0+$/, "");
    return text || undefined;
  } catch {
    return raw || undefined;
  }
}

function normalizeWitness(value: unknown): TronWitness | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const address = hexToBase58(raw.address);
  if (!address) return null;
  return {
    address,
    voteCount: quantityString(raw.voteCount ?? raw.vote_count),
    url: decodeAsciiHex(raw.url),
    totalProduced: optionalNumber(raw.totalProduced),
    totalMissed: optionalNumber(raw.totalMissed),
    latestBlockNum: optionalNumber(raw.latestBlockNum),
    latestSlotNum: optionalNumber(raw.latestSlotNum),
    isJobs: typeof raw.isJobs === "boolean" ? raw.isJobs : undefined,
  };
}

/** Parse node account JSON without first coercing 64-bit quantities through JS number. */
export function parseTronAccountResponse(text: string): TronAccount {
  return normalizeAccountValue(parseLosslessJson(text)) as TronAccount;
}

function safeNodeInteger(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  throw new ChainError("provider_error", `TRON node returned an imprecise or invalid ${field}`);
}

function safePermissionName(value: unknown, fallback: string, field: string): string {
  const name = value === undefined ? fallback : value;
  if (typeof name !== "string"
    || name.length === 0
    || Buffer.byteLength(name, "utf8") > 32
    || /\p{Cc}/u.test(name)) {
    throw new ChainError("provider_error", `TRON node returned an invalid ${field}`);
  }
  return name;
}

function permissionGroupFromNode(
  value: unknown,
  kind: string,
  fallbackId: number,
  constraints: { expectedId?: number; exactKeys?: number } = {},
): PermissionGroupView {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ChainError("provider_error", `TRON node returned malformed ${kind} permission data`);
  }
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.keys)
    || raw.keys.length === 0
    || raw.keys.length > 5
    || (constraints.exactKeys !== undefined && raw.keys.length !== constraints.exactKeys)) {
    throw new ChainError("provider_error", `TRON node returned an invalid ${kind} key count`);
  }
  const threshold = safeNodeInteger(raw.threshold, `${kind}.threshold`);
  if (threshold === 0) throw new ChainError("provider_error", `TRON node returned zero ${kind} threshold`);
  const seen = new Set<string>();
  let totalWeight = 0n;
  const keys = raw.keys.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new ChainError("provider_error", `TRON node returned malformed ${kind}.keys[${index}]`);
    }
    const key = entry as Record<string, unknown>;
    const address = hexToBase58(key.address);
    const weight = safeNodeInteger(key.weight, `${kind}.keys[${index}].weight`);
    if (!addressCodec("tron").validate(address) || weight === 0 || seen.has(address)) {
      throw new ChainError("provider_error", `TRON node returned invalid ${kind}.keys[${index}]`);
    }
    seen.add(address);
    totalWeight += BigInt(weight);
    return { address, weight, local: null };
  });
  if (BigInt(threshold) > totalWeight) {
    throw new ChainError("provider_error", `TRON node returned ${kind} threshold above total key weight`);
  }
  const id = raw.id === undefined ? fallbackId : safeNodeInteger(raw.id, `${kind}.id`);
  if (constraints.expectedId !== undefined && id !== constraints.expectedId) {
    throw new ChainError("provider_error", `TRON node returned invalid ${kind} permission id`);
  }
  return {
    id,
    name: safePermissionName(raw.permission_name, kind, `${kind}.permission_name`),
    threshold,
    keys,
  };
}

function activePermissionFromNode(value: unknown, index: number): ActivePermissionView {
  const group = permissionGroupFromNode(value, `active[${index}]`, index + 2);
  if (group.id < 2 || group.id > 9) {
    throw new ChainError("provider_error", `TRON node returned invalid active[${index}] permission id`);
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.operations !== "string") {
    throw new ChainError("provider_error", `TRON node returned active[${index}] without operations`);
  }
  let operations: ReturnType<typeof decodeOperations>;
  try {
    operations = decodeOperations(raw.operations);
  } catch {
    throw new ChainError("provider_error", `TRON node returned malformed active[${index}] operations`);
  }
  return {
    ...group,
    operations: operations.operations,
    operationLabels: operations.labels,
    operationsHex: operations.operationsHex,
    unknownOperationIds: operations.unknownOperationIds,
  };
}

function normalizeAccountValue(value: unknown, key?: string): unknown {
  if (isLosslessNumber(value)) {
    const exact = value.toString();
    if (key && (ACCOUNT_QUANTITY_KEYS.has(key) || /balance/i.test(key))) return exact;
    const number = Number(exact);
    return Number.isSafeInteger(number) ? number : exact;
  }
  if (Array.isArray(value)) return value.map((entry) => normalizeAccountValue(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entry]) => [entryKey, normalizeAccountValue(entry, entryKey)]),
    );
  }
  return value;
}

export interface FeeEstimate extends Record<string, unknown> {
  feeModel: "tron-resource";
  energy: number;
}

/** TRC20 metadata read via the contract's view methods; each field absent when the call reverts. */
/** tronweb error messages are often hex-encoded ASCII; decode best-effort. */
function decodeTronMessage(message?: string): string {
  if (!message) return "";
  if (/^[0-9a-fA-F]+$/.test(message) && message.length % 2 === 0) {
    try {
      return Buffer.from(message, "hex").toString("utf8");
    } catch {
      return message;
    }
  }
  return message;
}
