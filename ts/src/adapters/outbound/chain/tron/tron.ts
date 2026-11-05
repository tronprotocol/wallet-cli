import { decodeReceivedAmount } from "./received-amount.js";
import { providers, TronWeb, utils as tronUtils } from "tronweb";
import type { Types } from "tronweb";
import { parse as parseLosslessJson } from "lossless-json";
import type {
  AccountPermissionsView,
  BroadcastResult,
  PermissionGroupView,
  NetworkDescriptor,
  SignedTx,
  TronProtocolValue,
  TronTransactionArtifact,
  TypedDataPayload,
  UnsignedTx,
} from "../../../../domain/types/index.js";
import type { RpcResourceCode } from "../../../../domain/tron/resources/index.js";
import { sunAmount, type Sun } from "../../../../domain/amounts/index.js";
import type { Broadcaster } from "../../../../application/ports/chain/broadcaster.js";
import {
  UNWIRED_BROADCAST_GUARD,
  type BroadcastGuard,
} from "../../../../application/contracts/broadcast-guard.js";
import type {
  DecodedTronTransaction,
  TronContractParameter,
  TronContractMetadata,
  TronAccount,
  TronAccountState,
  TronAsset,
  TronAssetIssuance,
  TronAssetUpdate,
  TronExchange,
  TronBlock,
  TronDelegatedResource,
  TronGateway,
  TronHeadBlock,
  TronNodeInfo,
  TronPricePoint,
  TronProposal,
  TronReferenceBlockStatus,
  TronResourceUsage,
  TronSignWeight,
  TronTokenInfo,
  TronTx,
  TronTxInfo,
  TronVote,
  TronWitness,
} from "../../../../application/ports/chain/tron/tron-gateway.js";
import { ChainError, TransportError, UsageError } from "../../../../domain/errors/index.js";
import { redactErrorMessage } from "../../../../domain/errors/redact.js";
import { activeDispatch, untilAborted, withDispatchCheck } from "../../http/dispatch-context.js";
import {
  DeadlineExpiredError,
  type DispatchCheck,
} from "../../../../application/contracts/deadline.js";
import { tronHexToBase58 } from "../../../../domain/address/index.js";
import { parseTronTx, parseTronTxInfo } from "./tron-responses.js";
import {
  activePermissionFromNode,
  parseTronAccountResponse,
  permissionGroupFromNode,
  tronAccountState,
  tronResourceUsage,
  type NodeAccount,
} from "./account-response.js";
import {
  assertUsableAsset,
  assetList,
  exchangeValue,
  parseTronAssetResponse,
} from "./asset-response.js";
import {
  broadcastResult,
  normalizeProposal,
  normalizeWitness,
  parsePriceTimeline,
  parseTronBlockResponse,
  tronBlock,
  tronNodeInfo,
} from "./chain-response.js";
import {
  decodeAbiString,
  decodeAbiUint,
  decodeTronMessage,
  nodeQuantity,
  normalizeAccountValue,
  normalizeTxInfoValue,
  quantityString,
  safeChainParameter,
  safeNodeInteger,
} from "./node-values.js";
import { assertBuiltTx } from "./tx-guard.js";
import { decodeTronTransaction } from "./transaction-decoder.js";
import { isDeployedContract, normalizeContractResponses } from "./contract-response.js";
import {
  proposalCreateTxJsonToPbExact,
  updateEnergyLimitTxJsonToPbExact,
} from "./proposal-protobuf.js";
import {
  decodeTransactionHex,
  encodeTransactionHex,
  encodeTransactionJson,
  normalizeTransactionHex,
  refreshTransactionIdentity,
} from "./transaction-codec.js";
import { decodeOperations } from "../../../../domain/tron/permission/index.js";
import { FAMILIES } from "../../../../domain/family/index.js";
import {
  FetchHttpTransport,
  HttpTransportError,
  httpTransportFailure,
  networkHttpConfig,
  type HttpEndpointConfig,
  type HttpTransport,
} from "../../http/index.js";
import { PacedHttpTransport, RequestPacer } from "../../http/request-pacer.js";

// Placeholder base58 caller for constant calls; no signing key is configured.
const TRON_READ_OWNER = FAMILIES.tron.zeroAddress;
const DEFAULT_ACTIVE_OPERATIONS =
  "7fff1fc0033ef30f000000000000000000000000000000000000000000000000";

// Convert 41-prefixed hex to base58; pass through base58 and empty values.
export function hexToBase58(addr: unknown): string {
  return tronHexToBase58(addr);
}

// java-tron answers a reverted constant call with result.result true and the transaction marked FAILED.
function throwIfReverted(response: unknown): void {
  const reply = response as
    | {
        result?: { result?: unknown };
        transaction?: { ret?: { ret?: unknown }[] };
        constant_result?: unknown[];
      }
    | undefined;
  if (reply?.result?.result !== true || reply.transaction?.ret?.[0]?.ret !== "FAILED") return;
  const raw = reply.constant_result?.[0];
  throw new ChainError(
    "execution_reverted",
    "TRON constant call reverted",
    typeof raw === "string" && /^[0-9a-f]+$/i.test(raw) ? { revertData: `0x${raw}` } : undefined,
  );
}

interface AxiosSignalConfig {
  signal?: AbortSignal;
}

export class TronRpcClient implements TronGateway, Broadcaster {
  #tw: InstanceType<typeof TronWeb>;
  readonly #transport: HttpTransport;
  readonly #broadcastGuard: BroadcastGuard;
  // Share one request budget across this client's raw HTTP and TronWeb providers.
  readonly #pacer = new RequestPacer({ minIntervalMs: 400, maxInFlight: 2 });
  readonly #pacedProviders = new WeakSet<object>();
  constructor(
    fullHostOrConfig: string | NetworkDescriptor | HttpEndpointConfig,
    transport?: HttpTransport,
    guard: BroadcastGuard = UNWIRED_BROADCAST_GUARD,
  ) {
    let config: HttpEndpointConfig;
    try {
      config =
        typeof fullHostOrConfig === "string"
          ? { endpoint: fullHostOrConfig, headers: {} }
          : "endpoint" in fullHostOrConfig
            ? fullHostOrConfig
            : networkHttpConfig(fullHostOrConfig);
    } catch (error) {
      const failure =
        error instanceof HttpTransportError ? httpTransportFailure(error) : "invalid HTTP endpoint";
      throw new TransportError("rpc_error", `TRON RPC configuration failed: ${failure}`);
    }
    const tronProvider = () => {
      // 0 = no Axios timer; the dispatch check's signal ends the request.
      const provider = new providers.HttpProvider(config.endpoint, 0, "", "", {
        ...config.headers,
      });
      // TronWeb's types omit the Axios defaults and interceptors exposed at runtime.
      const axios = provider.instance as unknown as {
        defaults: { maxRedirects: number };
        interceptors: {
          request: {
            use(
              fn: (request: AxiosSignalConfig) => AxiosSignalConfig,
              onRejected: undefined,
              options: { synchronous: boolean },
            ): void;
          };
        };
      };
      // Synchronous, so Axios starts the HTTP request in the same turn as this check; an
      // asynchronous interceptor leaves a gap in which the deadline can pass before the send.
      axios.interceptors.request.use(
        (request) => {
          const check = activeDispatch()?.check;
          check?.assertDispatchable();
          if (check) request.signal = check.signal;
          return request;
        },
        undefined,
        { synchronous: true },
      );
      // Prevent redirects from forwarding configured credential headers.
      if (Object.keys(config.headers).length > 0) axios.defaults.maxRedirects = 0;
      return provider;
    };
    this.#tw = new TronWeb({
      fullNode: tronProvider(),
      solidityNode: tronProvider(),
      eventServer: tronProvider(),
    });
    this.#broadcastGuard = guard;
    this.#transport = new PacedHttpTransport(
      transport ?? new FetchHttpTransport(config),
      this.#pacer,
    );
    this.#tw.setAddress(TRON_READ_OWNER);
    this.#paceTronWebProviders();
  }
  // Reapply pacing when TronWeb replaces a provider, including through header setters.
  #paceTronWebProviders(): void {
    const tw = this.#tw as unknown as Record<string, (...args: unknown[]) => unknown>;
    for (const swap of ["setFullNode", "setSolidityNode", "setEventServer"]) {
      const original = tw[swap]!.bind(this.#tw);
      tw[swap] = (...args: unknown[]) => {
        const result = original(...args);
        this.#paceCurrentProviders();
        return result;
      };
    }
    this.#paceCurrentProviders();
  }
  // Wrapping twice would acquire two permits for one request and can deadlock.
  #paceCurrentProviders(): void {
    for (const provider of [this.#tw.fullNode, this.#tw.solidityNode, this.#tw.eventServer]) {
      if (!provider || this.#pacedProviders.has(provider)) continue;
      this.#pacedProviders.add(provider);
      const request = provider.request.bind(provider);
      provider.request = ((...args: Parameters<typeof request>) =>
        this.#pacer.run(async () => {
          const response = await request(...args);
          // Classify a revert before TronWeb throws result.message as a plain Error.
          if (String(args[0]).endsWith("/triggerconstantcontract")) throwIfReverted(response);
          return response;
        })) as typeof request;
    }
  }

  async getNativeBalance(address: string): Promise<Sun> {
    const account = await this.#account(address);
    return sunAmount(nodeQuantity(account.balance, "balance"));
  }
  async broadcast(signed: SignedTx, check: DispatchCheck): Promise<BroadcastResult> {
    this.#broadcastGuard.assertAllowed();
    let res: Types.BroadcastReturn<Types.SignedTransaction>;
    try {
      res = await withDispatchCheck(check, () =>
        untilAborted(
          this.#tw.trx.sendRawTransaction(signed as unknown as Types.SignedTransaction),
          "TRON broadcast",
        ),
      );
    } catch (e) {
      // A deadline error means the transaction was not sent; a TransportError means it may have been.
      if (
        e instanceof ChainError ||
        e instanceof TransportError ||
        e instanceof DeadlineExpiredError
      )
        throw e;
      throw new TransportError(
        "rpc_error",
        `TRON broadcast failed: ${redactErrorMessage((e as Error).message ?? "")}`,
      );
    }
    return broadcastResult(res, "txID" in signed ? signed.txID : undefined);
  }

  prepareTransaction(
    transaction: TronTransactionArtifact,
    options: { permissionId: number; expiration?: number },
  ): TronTransactionArtifact {
    if (!transaction || typeof transaction !== "object") {
      throw new ChainError("invalid_transaction", "TRON builder returned a non-object transaction");
    }
    const prepared = structuredClone(transaction) as TronTransactionArtifact;
    if (Array.isArray(prepared.signature) && prepared.signature.length > 0) {
      throw new ChainError(
        "invalid_transaction",
        "cannot prepare a transaction that is already signed",
      );
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
        throw new ChainError(
          "invalid_transaction",
          "TRON transaction timestamp is missing or imprecise",
        );
      }
      const expiration = timestamp! + options.expiration;
      if (!Number.isSafeInteger(expiration)) {
        throw new ChainError("invalid_transaction", "TRON transaction expiration is imprecise");
      }
      prepared.raw_data.expiration = expiration;
    }
    return refreshTransactionIdentity(prepared);
  }

  encodeTransactionHex(transaction: TronTransactionArtifact): string {
    return encodeTransactionHex(transaction);
  }

  encodeTransactionJson(json: TronProtocolValue): {
    transaction: TronTransactionArtifact;
    hex: string;
  } {
    return encodeTransactionJson(json);
  }

  decodeTransactionHex(hex: string): TronTransactionArtifact {
    return decodeTransactionHex(hex);
  }

  async getAccountPermissions(address: string): Promise<AccountPermissionsView> {
    const account = await this.#account(address);
    const returnedAddress = hexToBase58(account.address);
    if (!returnedAddress) {
      throw new ChainError("not_found", `TRON account is not activated: ${address}`);
    }
    if (returnedAddress !== address) {
      throw new ChainError(
        "provider_error",
        "TRON node returned permissions for a different account",
      );
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
        actives: [
          {
            ...defaultGroup(2, "active"),
            operations: decoded.operations,
            operationLabels: decoded.labels,
            operationsHex: decoded.operationsHex,
            unknownOperationIds: decoded.unknownOperationIds,
          },
        ],
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
      ? permissionGroupFromNode(account.witness_permission, "witness", 1, {
          expectedId: 1,
          exactKeys: 1,
        })
      : null;
    const actives = (activeRaw ?? []).map((permission, index) =>
      activePermissionFromNode(permission, index),
    );
    if (new Set(actives.map((permission) => permission.id)).size !== actives.length) {
      throw new ChainError("provider_error", "TRON node returned duplicate active permission ids");
    }
    return { address, owner, witness, actives };
  }

  async buildAccountPermissionUpdate(
    owner: string,
    permissions: AccountPermissionsView,
  ): Promise<TronTransactionArtifact> {
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

  async getSignWeight(transaction: TronTransactionArtifact): Promise<TronSignWeight> {
    return this.#wrap("getSignWeight", async () => {
      // TronWeb mutates absent Permission_id; keep the caller's artifact isolated.
      const response = await this.#tw.trx.getSignWeight(
        structuredClone(transaction) as unknown as Types.Transaction,
      );
      const permission = response.permission
        ? permissionGroupFromNode(
            response.permission,
            "permission",
            Number(response.permission.id ?? 0),
          )
        : null;
      return {
        permission: permission
          ? {
              id: permission.id,
              name: permission.name,
              threshold: permission.threshold,
              operationsHex:
                typeof response.permission.operations === "string"
                  ? response.permission.operations.toLowerCase()
                  : undefined,
              keys: permission.keys.map(({ address: keyAddress, weight }) => ({
                address: keyAddress,
                weight,
              })),
            }
          : null,
        approvedList: (response.approved_list ?? []).map(hexToBase58),
        // Protobuf JSON omits scalar zero values.
        currentWeight: safeNodeInteger(response.current_weight ?? 0, "current_weight"),
        resultCode: String(response.result?.code ?? ""),
        message: decodeTronMessage(response.result?.message),
      };
    });
  }

  async getApprovedList(transaction: TronTransactionArtifact): Promise<string[]> {
    return this.#wrap("getApprovedList", async () => {
      const response = await this.#tw.trx.getApprovedList(
        structuredClone(transaction) as unknown as Types.Transaction,
      );
      return (response.approved_list ?? []).map(hexToBase58);
    });
  }

  async broadcastHex(input: string, check: DispatchCheck): Promise<BroadcastResult> {
    this.#broadcastGuard.assertAllowed();
    const hex = normalizeTransactionHex(input);
    const { txID } = decodeTransactionHex(hex);
    const response = await withDispatchCheck(check, () =>
      this.#wrap("broadcast hex", () => this.#tw.trx.sendHexTransaction(hex)),
    );
    return broadcastResult(response, txID);
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

  async buildNativeTransfer(
    from: string,
    to: string,
    amountSun: string,
  ): Promise<TronTransactionArtifact> {
    // TronWeb requires a JS number; reject amounts that would lose precision.
    const n = this.#safeNumber(amountSun);
    return this.#wrap("build native transfer", async () =>
      assertBuiltTx(await this.#tw.transactionBuilder.sendTrx(to, n, from), "TransferContract"),
    );
  }

  async buildAccountCreate(owner: string, target: string): Promise<TronTransactionArtifact> {
    return this.#localAccountTransaction("AccountCreateContract", owner, {
      owner_address: this.#tw.address.toHex(owner),
      account_address: this.#tw.address.toHex(target),
    });
  }

  async buildAccountUpdate(owner: string, accountName: string): Promise<TronTransactionArtifact> {
    return this.#localAccountTransaction("AccountUpdateContract", owner, {
      owner_address: this.#tw.address.toHex(owner),
      account_name: Buffer.from(accountName, "utf8").toString("hex"),
    });
  }

  async buildSetAccountId(owner: string, accountId: string): Promise<TronTransactionArtifact> {
    // Build locally: TronWeb checks hex length instead of UTF-8 byte length for account IDs.
    return this.#localAccountTransaction("SetAccountIdContract", owner, {
      owner_address: this.#tw.address.toHex(owner),
      account_id: Buffer.from(accountId, "utf8").toString("hex"),
    });
  }

  async #localAccountTransaction(
    type: "AccountCreateContract" | "AccountUpdateContract" | "SetAccountIdContract",
    owner: string,
    value: Record<string, unknown>,
  ): Promise<TronTransactionArtifact> {
    return this.#wrap(`build ${type}`, async () => {
      const block = await this.#tw.trx.getCurrentRefBlockParams();
      const transaction = refreshTransactionIdentity({
        visible: false,
        txID: "",
        raw_data_hex: "",
        raw_data: {
          contract: [
            {
              parameter: {
                value,
                type_url: `type.googleapis.com/protocol.${type}`,
              },
              type,
            },
          ],
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

  #wrap<T>(label: string, fn: () => Promise<T>): Promise<T> {
    return untilAborted(this.#guard(label, fn), `TRON ${label}`);
  }
  async #guard<T>(label: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (
        e instanceof ChainError ||
        e instanceof UsageError ||
        e instanceof TransportError ||
        e instanceof DeadlineExpiredError
      )
        throw e;
      if (e instanceof HttpTransportError) {
        if (e.kind === "timeout") {
          throw new ChainError("timeout", `TRON ${label} timed out`);
        }
        throw new TransportError("rpc_error", `TRON ${label} failed: ${httpTransportFailure(e)}`);
      }
      throw new TransportError(
        "rpc_error",
        `TRON ${label} failed: ${redactErrorMessage((e as Error).message?.split("\n")[0] ?? "")}`,
      );
    }
  }

  // Keep the raw response body for lossless numeric parsing.
  async #post(path: string, body: unknown): Promise<string> {
    return this.#transport.requestText({
      method: "POST",
      path,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async getAccount(address: string): Promise<TronAccount> {
    const account = await this.#account(address);
    return {
      ...(typeof account.address === "string" ? { address: account.address } : {}),
      ...(account.balance === undefined ? {} : { balance: account.balance }),
    };
  }

  async #account(address: string): Promise<NodeAccount> {
    return this.#wrap("getAccount", async () => {
      return parseTronAccountResponse(
        await this.#post("/wallet/getaccount", { address: this.#tw.address.toHex(address) }),
      );
    });
  }
  async getAccountState(address: string): Promise<TronAccountState> {
    return tronAccountState(await this.#account(address), address);
  }
  async getAccountStateById(accountId: string): Promise<TronAccountState> {
    return this.#wrap("getAccountById", async () => {
      return tronAccountState(
        parseTronAccountResponse(
          await this.#post("/wallet/getaccountbyid", {
            account_id: Buffer.from(accountId, "utf8").toString("hex"),
          }),
        ),
      );
    });
  }
  async getAccountResources(address: string): Promise<TronResourceUsage> {
    return this.#wrap("getAccountResources", async () =>
      tronResourceUsage(await this.#tw.trx.getAccountResources(address)),
    );
  }
  async getBlock(numberOrLatest?: string): Promise<TronBlock | null> {
    return tronBlock(
      await this.#rawBlock(
        numberOrLatest === undefined ? undefined : this.#safeNumber(numberOrLatest, "block number"),
      ),
    );
  }
  async getHeadBlock(): Promise<TronHeadBlock> {
    const header = (await this.#rawBlock()).block_header?.raw_data;
    if (header?.number === undefined || header.timestamp === undefined) {
      throw new ChainError("invalid_node_response", "the node reported no latest block");
    }
    return {
      number: safeNodeInteger(header.number, "head block number"),
      timestampMs: safeNodeInteger(header.timestamp, "head block timestamp"),
    };
  }
  async #rawBlock(height?: number): Promise<Types.Block> {
    return this.#wrap("getBlock", async () => {
      const endpoint = height === undefined ? "getnowblock" : "getblockbynum";
      return parseTronBlockResponse(
        await this.#post(`/wallet/${endpoint}`, height === undefined ? {} : { num: height }),
      );
    });
  }
  typedDataDigest(payload: TypedDataPayload): string {
    try {
      return tronUtils.typedData.TypedDataEncoder.hash(
        payload.domain as never,
        payload.types as never,
        payload.message,
      );
    } catch (e) {
      throw new UsageError(
        "invalid_payload",
        `typed data could not be hashed: ${(e as Error).message}`,
      );
    }
  }

  async referenceBlockStatus(transaction: UnsignedTx): Promise<TronReferenceBlockStatus> {
    const raw = (transaction as { raw_data?: Record<string, unknown> } | null)?.raw_data;
    const refBytes = raw?.ref_block_bytes;
    const refHash = raw?.ref_block_hash;
    if (
      typeof refBytes !== "string" ||
      !/^[0-9a-f]{4}$/i.test(refBytes) ||
      typeof refHash !== "string" ||
      !/^[0-9a-f]{16}$/i.test(refHash)
    ) {
      throw new ChainError("invalid_transaction", "transaction carries no valid reference block");
    }
    const head = await this.#rawBlock();
    const headNumber = safeNodeInteger(head.block_header?.raw_data?.number, "head block number");
    // ref_block_bytes is the low 16 bits of the height; take the highest such height at or below head.
    const height = headNumber - ((((headNumber - parseInt(refBytes, 16)) % 65536) + 65536) % 65536);
    if (height >= 0) {
      const block = height === headNumber ? head : await this.#rawBlock(height);
      // ref_block_hash is bytes 8..16 of the block id.
      const blockId = typeof block.blockID === "string" ? block.blockID : "";
      if (blockId.slice(16, 32).toLowerCase() === refHash.toLowerCase()) return "held";
    }
    const headTime = safeNodeInteger(
      head.block_header?.raw_data?.timestamp,
      "head block timestamp",
    );
    const createdAt = Number(raw?.timestamp);
    return Number.isFinite(createdAt) && createdAt > headTime ? "not-reached" : "different";
  }
  async getTransactionById(txid: string): Promise<TronTx> {
    return this.#wrap("getTransaction", async () =>
      parseTronTx(await this.#tw.trx.getTransaction(txid)),
    );
  }
  async receivedAmount(
    txid: string,
    token: string,
    recipient: string,
  ): Promise<string | undefined> {
    return decodeReceivedAmount(await this.getTransactionInfoById(txid), token, recipient);
  }

  async getTransactionInfoById(txid: string): Promise<TronTxInfo> {
    // Read full-node inclusion receipts without waiting for solidification.
    return this.#wrap("getTransactionInfo", async () =>
      parseTronTxInfo(
        normalizeTxInfoValue(
          parseLosslessJson(await this.#post("/wallet/gettransactioninfobyid", { value: txid })),
        ),
      ),
    );
  }
  decodeTransaction(transaction: TronTransactionArtifact): DecodedTronTransaction {
    return decodeTronTransaction(transaction);
  }

  async #constant(
    contract: string,
    fn: string,
    params: Types.ContractFunctionParameter[],
    owner = TRON_READ_OWNER,
  ): Promise<string[]> {
    const res = await this.#tw.transactionBuilder.triggerConstantContract(
      contract,
      fn,
      {},
      params,
      owner,
    );
    // Reverts were already thrown by the provider; TronWeb returns a non-JSON body as a string.
    if (typeof res !== "object" || res === null || typeof res.result !== "object") {
      throw new ChainError("invalid_node_response", `TRON ${fn} returned no call result`);
    }
    if (res.result.result !== true) {
      const { code } = res.result as { code?: unknown };
      const reason = decodeTronMessage(res.result.message) || String(code ?? "no result");
      throw new TransportError("rpc_error", `TRON ${fn} failed: ${redactErrorMessage(reason)}`);
    }
    return (res.constant_result ?? []) as string[];
  }

  async getTrc20Balance(contract: string, address: string): Promise<string> {
    return this.#wrap("trc20 balanceOf", async () => {
      const [hex] = await this.#notAToken(contract, "balanceOf", () =>
        this.#constant(contract, "balanceOf(address)", [{ type: "address", value: address }]),
      );
      return hex ? BigInt("0x" + hex).toString() : "0";
    });
  }

  // Classify known non-token errors; propagate transport faults and other failures.
  async #notAToken<T>(contract: string, method: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      const message = (e as Error).message ?? "";
      if (
        (e instanceof ChainError && e.code === "execution_reverted") ||
        /smart contract is not exist|revert opcode executed/i.test(message)
      ) {
        throw new ChainError(
          "token_metadata_unavailable",
          `${contract} did not answer ${method} — it may not be a token contract`,
        );
      }
      throw e;
    }
  }

  async getTokenInfo(contract: string): Promise<TronTokenInfo> {
    return this.#wrap("trc20 tokenInfo", async () =>
      this.#notAToken(contract, "the TRC-20 view methods", async () => {
        // Selector calls support tokens with no published ABI.
        // Empty returns decode as absent metadata; failures must propagate.
        const read = async (fn: string): Promise<string | undefined> =>
          this.#constant(contract, fn, []).then(([hex]) => hex);
        const [name, symbol, decimals, totalSupply] = await Promise.all([
          read("name()"),
          read("symbol()"),
          read("decimals()"),
          read("totalSupply()"),
        ]);
        const scale = decodeAbiUint(decimals);
        return {
          contract,
          name: decodeAbiString(name),
          symbol: decodeAbiString(symbol),
          decimals: scale !== undefined && scale <= 255n ? Number(scale) : undefined,
          totalSupply: decodeAbiUint(totalSupply)?.toString(),
        };
      }),
    );
  }

  async getTrc10Balance(assetId: string, address: string): Promise<string> {
    return this.#wrap("trc10 balance", async () => {
      const acct = await this.#account(address);
      const entry = (acct.assetV2 ?? []).find((a) => String(a.key) === String(assetId));
      return entry?.value ?? "0";
    });
  }
  // Token precision determines the base-unit amount signed by transfers.
  async getTrc10Info(assetId: string): Promise<TronAsset> {
    return this.#wrap("trc10 info", async () => {
      const raw = parseTronAssetResponse(
        await this.#post("/wallet/getassetissuebyid", { value: assetId }),
      );
      return assertUsableAsset(raw, assetId);
    });
  }

  async buildTrc20Transfer(
    from: string,
    to: string,
    contract: string,
    amount: string,
    feeLimit: Sun,
  ): Promise<TronTransactionArtifact> {
    const fee = this.#safeNumber(feeLimit, "fee limit");
    return this.#wrap("build trc20 transfer", async () => {
      // txLocal keeps calldata construction off the node.
      const { transaction } = await this.#tw.transactionBuilder.triggerSmartContract(
        contract,
        "transfer(address,uint256)",
        { feeLimit: fee, txLocal: true },
        [
          { type: "address", value: to },
          { type: "uint256", value: amount },
        ],
        from,
      );
      return assertBuiltTx(transaction, "TriggerSmartContract");
    });
  }
  async buildTrc10Transfer(
    from: string,
    to: string,
    assetId: string,
    amount: string,
  ): Promise<TronTransactionArtifact> {
    const n = this.#safeNumber(amount);
    return this.#wrap("build trc10 transfer", async () =>
      assertBuiltTx(
        await this.#tw.transactionBuilder.sendToken(to, n, assetId, from),
        "TransferAssetContract",
      ),
    );
  }

  async getAssetById(assetId: string): Promise<TronAsset | undefined> {
    return this.#wrap("asset by id", async () => {
      // An unknown asset ID returns an empty object.
      const raw = parseTronAssetResponse(
        await this.#post("/wallet/getassetissuebyid", { value: assetId }),
      );
      return raw.owner_address === undefined ? undefined : assertUsableAsset(raw, assetId);
    });
  }

  async getAssetsByName(name: string): Promise<TronAsset[]> {
    return this.#wrap("assets by name", async () =>
      assetList(
        await this.#post("/wallet/getassetissuelistbyname", {
          value: Buffer.from(name, "utf8").toString("hex"),
        }),
      ),
    );
  }

  async getAssetByIssuer(address: string): Promise<TronAsset | undefined> {
    return this.#wrap("asset by issuer", async () => {
      // Each account can issue at most one asset.
      const issued = assetList(
        await this.#post("/wallet/getassetissuebyaccount", {
          address: this.#tw.address.toHex(address),
        }),
      );
      return issued[0];
    });
  }

  async listAssets(limit: number, offset: number): Promise<TronAsset[]> {
    return this.#wrap("list assets", async () =>
      assetList(await this.#post("/wallet/getpaginatedassetissuelist", { offset, limit })),
    );
  }

  // Use local codecs for AssetIssue tranches and UnfreezeAsset; fetch only the reference block.
  async #buildLocally(
    type: string,
    value: Record<string, unknown>,
  ): Promise<TronTransactionArtifact> {
    const refBlock = await this.#tw.trx.getCurrentRefBlockParams();
    const built = refreshTransactionIdentity({
      visible: false,
      raw_data: {
        ...refBlock,
        contract: [
          {
            parameter: { value, type_url: `type.googleapis.com/protocol.${type}` },
            type,
          },
        ],
      },
    } as never);
    return assertBuiltTx(built, type);
  }

  async buildAssetIssue(
    owner: string,
    issuance: TronAssetIssuance,
  ): Promise<TronTransactionArtifact> {
    return this.#wrap("build asset issue", async () =>
      this.#buildLocally("AssetIssueContract", {
        owner_address: this.#toHexAddress(owner),
        name: Buffer.from(issuance.name, "utf8").toString("hex"),
        abbr: Buffer.from(issuance.abbr, "utf8").toString("hex"),
        description: Buffer.from(issuance.description, "utf8").toString("hex"),
        url: Buffer.from(issuance.url, "utf8").toString("hex"),
        total_supply: issuance.totalSupply,
        trx_num: issuance.trxNum,
        num: issuance.num,
        precision: issuance.precision,
        start_time: issuance.startTime,
        end_time: issuance.endTime,
        free_asset_net_limit: issuance.freeAssetNetLimit,
        public_free_asset_net_limit: issuance.publicFreeAssetNetLimit,
        frozen_supply: issuance.frozenSupply,
      }),
    );
  }

  async buildAssetUnfreeze(owner: string): Promise<TronTransactionArtifact> {
    return this.#wrap("build asset unfreeze", async () =>
      this.#buildLocally("UnfreezeAssetContract", { owner_address: this.#toHexAddress(owner) }),
    );
  }

  async buildAssetUpdate(owner: string, update: TronAssetUpdate): Promise<TronTransactionArtifact> {
    return this.#wrap("build asset update", async () =>
      assertBuiltTx(
        await this.#tw.transactionBuilder.updateToken(
          {
            description: update.description,
            url: update.url,
            freeBandwidth: update.freeAssetNetLimit,
            freeBandwidthLimit: update.publicFreeAssetNetLimit,
          },
          owner,
        ),
        "UpdateAssetContract",
      ),
    );
  }

  async buildAssetParticipate(
    owner: string,
    issuer: string,
    assetId: string,
    amountSun: string,
  ): Promise<TronTransactionArtifact> {
    const amount = this.#safeNumber(amountSun);
    return this.#wrap("build asset participate", async () =>
      assertBuiltTx(
        await this.#tw.transactionBuilder.purchaseToken(issuer, assetId, amount, owner),
        "ParticipateAssetIssueContract",
      ),
    );
  }

  // Exchange token IDs are hex-encoded text; "5f" decodes to the TRX marker "_".
  #toExchange(raw: Record<string, unknown>): TronExchange {
    const tokenId = (value: unknown): string => {
      const hex = String(value ?? "");
      if (!/^([0-9a-fA-F]{2})+$/.test(hex)) return hex;
      return Buffer.from(hex, "hex").toString("utf8");
    };
    return {
      exchangeId: Number(raw.exchange_id ?? 0),
      creatorAddress: tronHexToBase58(raw.creator_address),
      createTime: Number(raw.create_time ?? 0),
      firstTokenId: tokenId(raw.first_token_id),
      firstTokenBalance: String(raw.first_token_balance ?? 0),
      secondTokenId: tokenId(raw.second_token_id),
      secondTokenBalance: String(raw.second_token_balance ?? 0),
    };
  }

  async getExchangeById(exchangeId: number): Promise<TronExchange | undefined> {
    return this.#wrap("exchange by id", async () => {
      const found = exchangeValue(await this.#post("/wallet/getexchangebyid", { id: exchangeId }));
      // An unknown exchange ID returns an empty object.
      if (found.exchange_id === undefined) return undefined;
      if (Number(found.exchange_id) !== exchangeId) {
        throw new ChainError(
          "invalid_node_response",
          `asked the node for exchange ${exchangeId} and it answered with ${JSON.stringify(found.exchange_id)}`,
        );
      }
      return this.#toExchange(found);
    });
  }

  async listExchanges(limit: number, offset: number): Promise<TronExchange[]> {
    return this.#wrap("list exchanges", async () => {
      const raw = exchangeValue(
        await this.#post("/wallet/getpaginatedexchangelist", { offset, limit }),
      );
      const page = Array.isArray(raw.exchanges) ? raw.exchanges : [];
      return page.map((entry) => this.#toExchange(entry as Record<string, unknown>));
    });
  }

  async buildExchangeCreate(
    owner: string,
    firstTokenId: string,
    firstBalance: string,
    secondTokenId: string,
    secondBalance: string,
  ): Promise<TronTransactionArtifact> {
    const first = this.#safeNumber(firstBalance);
    const second = this.#safeNumber(secondBalance);
    return this.#wrap("build exchange create", async () =>
      // createTokenExchange preserves token order; createTRXExchange forces TRX into slot two.
      assertBuiltTx(
        await this.#tw.transactionBuilder.createTokenExchange(
          firstTokenId,
          first,
          secondTokenId,
          second,
          owner,
        ),
        "ExchangeCreateContract",
      ),
    );
  }

  async buildExchangeInject(
    owner: string,
    exchangeId: number,
    tokenId: string,
    quant: string,
  ): Promise<TronTransactionArtifact> {
    const amount = this.#safeNumber(quant);
    return this.#wrap("build exchange inject", async () =>
      assertBuiltTx(
        await this.#tw.transactionBuilder.injectExchangeTokens(exchangeId, tokenId, amount, owner),
        "ExchangeInjectContract",
      ),
    );
  }

  async buildExchangeWithdraw(
    owner: string,
    exchangeId: number,
    tokenId: string,
    quant: string,
  ): Promise<TronTransactionArtifact> {
    const amount = this.#safeNumber(quant);
    return this.#wrap("build exchange withdraw", async () =>
      assertBuiltTx(
        await this.#tw.transactionBuilder.withdrawExchangeTokens(
          exchangeId,
          tokenId,
          amount,
          owner,
        ),
        "ExchangeWithdrawContract",
      ),
    );
  }

  async buildExchangeTrade(
    owner: string,
    exchangeId: number,
    tokenId: string,
    quant: string,
    expected: string,
  ): Promise<TronTransactionArtifact> {
    const amount = this.#safeNumber(quant);
    const floor = this.#safeNumber(expected);
    return this.#wrap("build exchange trade", async () =>
      assertBuiltTx(
        await this.#tw.transactionBuilder.tradeExchangeTokens(
          exchangeId,
          tokenId,
          amount,
          floor,
          owner,
        ),
        "ExchangeTransactionContract",
      ),
    );
  }

  #toHexAddress(address: string): string {
    try {
      return TronWeb.address.toHex(address).replace(/^0x/, "");
    } catch {
      throw new UsageError("invalid_address", "owner address is not a TRON address");
    }
  }

  async estimateEnergy(
    from: string,
    contract: string,
    fn: string,
    params: TronContractParameter[],
    callValueSun = "0",
  ): Promise<number> {
    const callValue = this.#safeNumber(callValueSun, "call value");
    return this.#wrap("estimateEnergy", async () => {
      const res = await this.#tw.transactionBuilder.triggerConstantContract(
        contract,
        fn,
        { callValue },
        params as Types.ContractFunctionParameter[],
        from,
      );
      return Number(res.energy_used ?? res.energy_required ?? 0);
    });
  }
  async estimateResources(
    from: string,
    contract: string,
    fn: string,
    params: TronContractParameter[],
    callValueSun: Sun = sunAmount("0"),
  ): Promise<FeeEstimate> {
    const [energy, prices, resources] = await Promise.all([
      this.estimateEnergy(from, contract, fn, params, callValueSun),
      this.getEnergyPrices().catch(() => undefined),
      this.getAccountResources(from).catch(() => undefined),
    ]);
    const price = prices?.at(-1)?.sunPerUnit;
    return {
      feeModel: "tron-resource",
      energy,
      energyPriceSun: price === undefined || price === 0 ? undefined : String(price),
      availableEnergy: resources ? resources.energy.limit - resources.energy.used : undefined,
    };
  }

  async buildFreezeV2(
    owner: string,
    amountSun: string,
    resource: RpcResourceCode,
  ): Promise<TronTransactionArtifact> {
    const n = this.#safeNumber(amountSun);
    return this.#wrap("freezeBalanceV2", async () =>
      assertBuiltTx(
        await this.#tw.transactionBuilder.freezeBalanceV2(n, resource, owner),
        "FreezeBalanceV2Contract",
      ),
    );
  }
  async buildUnfreezeV2(
    owner: string,
    amountSun: string,
    resource: RpcResourceCode,
  ): Promise<TronTransactionArtifact> {
    const n = this.#safeNumber(amountSun);
    return this.#wrap("unfreezeBalanceV2", async () =>
      assertBuiltTx(
        await this.#tw.transactionBuilder.unfreezeBalanceV2(n, resource, owner),
        "UnfreezeBalanceV2Contract",
      ),
    );
  }
  async buildWithdrawExpireUnfreeze(owner: string): Promise<TronTransactionArtifact> {
    return this.#wrap("withdrawExpireUnfreeze", async () =>
      assertBuiltTx(
        await this.#tw.transactionBuilder.withdrawExpireUnfreeze(owner),
        "WithdrawExpireUnfreezeContract",
      ),
    );
  }
  async buildCancelAllUnfreezeV2(owner: string): Promise<TronTransactionArtifact> {
    return this.#wrap("cancelUnfreezeBalanceV2", async () =>
      assertBuiltTx(
        await this.#tw.transactionBuilder.cancelUnfreezeBalanceV2(owner),
        "CancelAllUnfreezeV2Contract",
      ),
    );
  }
  async buildDelegateResource(
    owner: string,
    amountSun: string,
    resource: RpcResourceCode,
    receiver: string,
    lock: boolean,
    lockPeriod?: string,
  ): Promise<TronTransactionArtifact> {
    const n = this.#safeNumber(amountSun);
    const lockBlocks =
      lockPeriod === undefined ? undefined : this.#safeNumber(lockPeriod, "lock period");
    return this.#wrap("delegateResource", async () =>
      assertBuiltTx(
        await this.#tw.transactionBuilder.delegateResource(
          n,
          receiver,
          resource,
          owner,
          lock,
          lockBlocks,
        ),
        "DelegateResourceContract",
      ),
    );
  }
  async buildUndelegateResource(
    owner: string,
    amountSun: string,
    resource: RpcResourceCode,
    receiver: string,
  ): Promise<TronTransactionArtifact> {
    const n = this.#safeNumber(amountSun);
    return this.#wrap("undelegateResource", async () =>
      assertBuiltTx(
        await this.#tw.transactionBuilder.undelegateResource(n, receiver, resource, owner),
        "UnDelegateResourceContract",
      ),
    );
  }

  async buildVoteWitness(owner: string, votes: TronVote[]): Promise<TronTransactionArtifact> {
    const voteInfo = Object.fromEntries(
      votes.map((vote) => [vote.witness, this.#safeNumber(vote.count, "vote count")]),
    );
    return this.#wrap("voteWitness", async () =>
      assertBuiltTx(await this.#tw.transactionBuilder.vote(voteInfo, owner), "VoteWitnessContract"),
    );
  }
  async buildWithdrawBalance(owner: string): Promise<TronTransactionArtifact> {
    return this.#wrap("withdrawBlockRewards", async () =>
      assertBuiltTx(
        await this.#tw.transactionBuilder.withdrawBlockRewards(owner),
        "WithdrawBalanceContract",
      ),
    );
  }
  async getWitnesses(limit: number): Promise<TronWitness[]> {
    const capped = Math.min(Math.max(Math.trunc(limit), 1), 127);
    return this.#wrap("getNowWitnessList", async () => {
      const raw = normalizeAccountValue(
        parseLosslessJson(
          await this.#post("/wallet/getpaginatednowwitnesslist", {
            offset: 0,
            limit: capped,
            visible: true,
          }),
        ),
      ) as Record<string, unknown>;
      const witnesses = Array.isArray(raw.witnesses) ? raw.witnesses : [];
      return witnesses.map(normalizeWitness).filter((w): w is TronWitness => w !== null);
    });
  }
  // Authorization needs all registered witnesses, including those outside the active SR set.
  async getWitness(address: string): Promise<TronWitness | null> {
    return this.#wrap("listWitnesses", async () => {
      const raw = normalizeAccountValue(
        parseLosslessJson(await this.#post("/wallet/listwitnesses", {})),
      ) as Record<string, unknown>;
      const witnesses = Array.isArray(raw.witnesses) ? raw.witnesses : [];
      const wanted = hexToBase58(address) || address;
      return (
        witnesses
          .map(normalizeWitness)
          .find(
            (witness): witness is TronWitness => witness !== null && witness.address === wanted,
          ) ?? null
      );
    });
  }
  async getProposals(): Promise<TronProposal[]> {
    return this.#wrap("listProposals", async () => {
      const raw = normalizeAccountValue(
        parseLosslessJson(await this.#post("/wallet/listproposals", {})),
      ) as Record<string, unknown>;
      const proposals = Array.isArray(raw.proposals) ? raw.proposals : [];
      return proposals
        .map(normalizeProposal)
        .filter((proposal): proposal is TronProposal => proposal !== null);
    });
  }
  async getProposal(id: number): Promise<TronProposal | null> {
    return this.#wrap("getProposalById", async () => {
      return normalizeProposal(
        normalizeAccountValue(
          parseLosslessJson(await this.#post("/wallet/getproposalbyid", { id })),
        ),
      );
    });
  }
  async buildProposalCreate(
    owner: string,
    parameters: Array<{ key: number; value: bigint }>,
    options: { permissionId?: number } = {},
  ): Promise<TronTransactionArtifact> {
    // int64 values beyond 2^53 stay exact as decimal text in the protocol JSON.
    const protocolParameters = parameters.map(({ key, value }) => ({
      key,
      value: value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString(),
    }));
    return this.#wrap("createProposal", async () =>
      assertBuiltTx(
        await this.#buildLocalTransaction(
          "ProposalCreateContract",
          { owner_address: this.#tw.address.toHex(owner), parameters: protocolParameters },
          options.permissionId,
        ),
        "ProposalCreateContract",
      ),
    );
  }
  async buildProposalApprove(
    owner: string,
    proposalId: number,
    addApproval: boolean,
    options: { permissionId?: number } = {},
  ): Promise<TronTransactionArtifact> {
    return this.#wrap("voteProposal", async () =>
      assertBuiltTx(
        await this.#tw.transactionBuilder.voteProposal(proposalId, addApproval, owner, options),
        "ProposalApproveContract",
      ),
    );
  }
  async buildProposalDelete(
    owner: string,
    proposalId: number,
    options: { permissionId?: number } = {},
  ): Promise<TronTransactionArtifact> {
    return this.#wrap("deleteProposal", async () =>
      assertBuiltTx(
        await this.#tw.transactionBuilder.deleteProposal(proposalId, owner, options),
        "ProposalDeleteContract",
      ),
    );
  }
  async buildWitnessCreate(
    owner: string,
    url: string,
    options: { permissionId?: number } = {},
  ): Promise<TronTransactionArtifact> {
    return this.#wrap("applyForSR", async () =>
      assertBuiltTx(
        await this.#tw.transactionBuilder.applyForSR(owner, url, options),
        "WitnessCreateContract",
      ),
    );
  }
  async buildWitnessUpdate(
    owner: string,
    url: string,
    options: { permissionId?: number } = {},
  ): Promise<TronTransactionArtifact> {
    return this.#wrap("updateWitness", async () =>
      assertBuiltTx(
        await this.#tw.transactionBuilder.updateWitness(owner, url, options),
        "WitnessUpdateContract",
      ),
    );
  }
  async buildWitnessSetBrokerage(
    owner: string,
    brokerage: number,
    options: { permissionId?: number } = {},
  ): Promise<TronTransactionArtifact> {
    return this.#wrap("updateBrokerage", async () =>
      assertBuiltTx(
        await this.#tw.transactionBuilder.updateBrokerage(brokerage, owner, options),
        "UpdateBrokerageContract",
      ),
    );
  }
  async getBrokerage(address: string): Promise<number> {
    return this.#wrap("getBrokerage", async () => {
      const raw = normalizeAccountValue(
        parseLosslessJson(
          await this.#post("/wallet/getBrokerage", {
            address: this.#tw.address.toHex(address),
          }),
        ),
      ) as Record<string, unknown>;
      if (raw.brokerage === undefined) throw new Error("brokerage not found");
      const brokerage = Number(raw.brokerage);
      return Number.isFinite(brokerage) ? brokerage : 0;
    });
  }
  async getReward(address: string): Promise<string> {
    return this.#wrap("getReward", async () => {
      const raw = normalizeAccountValue(
        parseLosslessJson(
          await this.#post("/wallet/getReward", { address: this.#tw.address.toHex(address) }),
        ),
      ) as Record<string, unknown>;
      return quantityString(raw.reward);
    });
  }

  async getEnergyPrices(): Promise<TronPricePoint[]> {
    return this.#wrap("getEnergyPrices", async () =>
      parsePriceTimeline(await this.#tw.trx.getEnergyPrices(), "energy"),
    );
  }
  async getBandwidthPrices(): Promise<TronPricePoint[]> {
    return this.#wrap("getBandwidthPrices", async () =>
      parsePriceTimeline(await this.#tw.trx.getBandwidthPrices(), "bandwidth"),
    );
  }

  async getChainParameters(): Promise<Array<{ key: string; value?: number }>> {
    return this.#wrap("getChainParameters", async () =>
      (await this.#tw.trx.getChainParameters()).map(({ key, value }) =>
        value === undefined ? { key } : { key, value: safeChainParameter(value, key) },
      ),
    );
  }
  async getNodeInfo(): Promise<TronNodeInfo> {
    return this.#wrap("getNodeInfo", async () => tronNodeInfo(await this.#tw.trx.getNodeInfo()));
  }

  async getDelegatedResourceV2(from: string, to: string): Promise<TronDelegatedResource[]> {
    return this.#wrap("getDelegatedResourceV2", async () => {
      const res = await this.#tw.trx.getDelegatedResourceV2(from, to);
      return (res.delegatedResource ?? []).map((d) => ({
        from: tronHexToBase58(d.from),
        to: tronHexToBase58(d.to),
        balanceForEnergySun: String(d.frozen_balance_for_energy ?? 0),
        balanceForBandwidthSun: String(d.frozen_balance_for_bandwidth ?? 0),
        expireTimeForEnergy: d.expire_time_for_energy ? Number(d.expire_time_for_energy) : null,
        expireTimeForBandwidth: d.expire_time_for_bandwidth
          ? Number(d.expire_time_for_bandwidth)
          : null,
      }));
    });
  }
  async getDelegatedIndexV2(
    address: string,
  ): Promise<{ fromAccounts: string[]; toAccounts: string[] }> {
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

  async triggerConstantContract(
    contract: string,
    fn: string,
    params: TronContractParameter[],
    owner = TRON_READ_OWNER,
  ): Promise<string[]> {
    return this.#wrap("triggerConstantContract", () =>
      this.#constant(contract, fn, params as Types.ContractFunctionParameter[], owner),
    );
  }
  async triggerSmartContract(
    from: string,
    contract: string,
    fn: string,
    params: TronContractParameter[],
    opts: { feeLimit?: Sun; callValue?: Sun; permissionId?: number } = {},
  ): Promise<TronTransactionArtifact> {
    const feeLimit =
      opts.feeLimit === undefined ? undefined : this.#safeNumber(opts.feeLimit, "fee limit");
    const callValue =
      opts.callValue === undefined ? undefined : this.#safeNumber(opts.callValue, "call value");
    return this.#wrap("triggerSmartContract", async () => {
      // txLocal keeps calldata construction off the node.
      const { transaction } = await this.#tw.transactionBuilder.triggerSmartContract(
        contract,
        fn,
        { feeLimit, callValue, permissionId: opts.permissionId, txLocal: true },
        params as Types.ContractFunctionParameter[],
        from,
      );
      return assertBuiltTx(transaction, "TriggerSmartContract");
    });
  }
  async deployContract(
    from: string,
    p: {
      abi: unknown;
      bytecode: string;
      feeLimit: Sun;
      parameters?: unknown[];
      permissionId?: number;
    },
  ): Promise<TronTransactionArtifact> {
    assertConstructorEncodable(p.abi);
    const feeLimit = this.#safeNumber(p.feeLimit, "fee limit");
    return this.#wrap("createSmartContract", async () =>
      assertBuiltTx(
        await this.#tw.transactionBuilder.createSmartContract(
          {
            abi: p.abi as Types.CreateSmartContractOptions["abi"],
            bytecode: p.bytecode,
            feeLimit,
            parameters: p.parameters,
            permissionId: p.permissionId,
          },
          from,
        ),
        "CreateSmartContract",
      ),
    );
  }
  deployedContractAddress(transaction: TronTransactionArtifact): string | undefined {
    const hex = (transaction as { contract_address?: unknown } | null)?.contract_address;
    return typeof hex === "string" && hex !== "" ? tronHexToBase58(hex) : undefined;
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
      // A call the command deadline stopped still fails; any other info failure only omits it.
      this.getContractInfo(address).catch((e: unknown) => {
        if (e instanceof DeadlineExpiredError || activeDispatch()?.check.signal.aborted) throw e;
        return undefined;
      }),
    ]);
    // getContract determines existence; getContractInfo is optional metadata.
    if (!isDeployedContract(contract)) {
      throw new ChainError("not_found", `no contract deployed at ${address}`);
    }
    return normalizeContractResponses(contract, info);
  }
  async buildClearContractAbi(
    owner: string,
    contract: string,
    options: { permissionId?: number } = {},
  ): Promise<TronTransactionArtifact> {
    return this.#wrap("clearContractABI", async () =>
      assertBuiltTx(
        await this.#tw.transactionBuilder.clearABI(contract, owner, options),
        "ClearABIContract",
      ),
    );
  }
  async buildUpdateOriginEnergyLimit(
    owner: string,
    contract: string,
    energy: number | string,
    options: { permissionId?: number } = {},
  ): Promise<TronTransactionArtifact> {
    // Build locally to bypass TronWeb's 10,000,000 energy-limit cap.
    return this.#wrap("updateEnergyLimit", async () =>
      assertBuiltTx(
        await this.#buildLocalTransaction(
          "UpdateEnergyLimitContract",
          {
            owner_address: this.#tw.address.toHex(owner),
            contract_address: this.#tw.address.toHex(contract),
            // Non-visible JSON broadcast requires a numeric int64 field; numeric strings fail to parse.
            origin_energy_limit:
              typeof energy === "string" ? this.#safeNumber(energy, "origin energy limit") : energy,
          },
          options.permissionId,
        ),
        "UpdateEnergyLimitContract",
      ),
    );
  }
  async buildUpdateUserResourcePercent(
    owner: string,
    contract: string,
    percent: number,
    options: { permissionId?: number } = {},
  ): Promise<TronTransactionArtifact> {
    return this.#wrap("updateSetting", async () =>
      assertBuiltTx(
        await this.#tw.transactionBuilder.updateSetting(contract, percent, owner, options),
        "UpdateSettingContract",
      ),
    );
  }

  // Build the payload locally, using only reference-block data from the node.
  async #buildLocalTransaction(
    type: string,
    value: Record<string, unknown>,
    permissionId?: number,
  ): Promise<TronTransactionArtifact> {
    const rawData = {
      contract: [
        {
          parameter: { value, type_url: `type.googleapis.com/protocol.${type}` },
          type,
          ...(permissionId ? { Permission_id: permissionId } : {}),
        },
      ],
      ...(await this.#tw.trx.getCurrentRefBlockParams()),
    };
    const shell = { visible: false, txID: "", raw_data_hex: "", raw_data: rawData };
    const protobuf =
      type === "ProposalCreateContract"
        ? proposalCreateTxJsonToPbExact(shell)
        : type === "UpdateEnergyLimitContract"
          ? updateEnergyLimitTxJsonToPbExact(shell)
          : tronUtils.transaction.txJsonToPb(shell);
    return {
      ...shell,
      txID: tronUtils.transaction.txPbToTxID(protobuf).replace(/^0x/, ""),
      raw_data_hex: tronUtils.transaction.txPbToRawDataHex(protobuf).toLowerCase(),
    } as unknown as TronTransactionArtifact;
  }

  // TronWeb builders require numbers; reject values above the safe-integer ceiling.
  #safeNumber(value: string, label = "amount"): number {
    const n = BigInt(value);
    if (n > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new UsageError(
        "invalid_amount",
        `${label} ${value} exceeds the safe-integer limit for this client`,
      );
    }
    return Number(n);
  }
}

function abiEntries(abi: unknown): unknown[] | undefined {
  if (Array.isArray(abi)) return abi;
  const wrapped = (abi as { entrys?: unknown } | null)?.entrys;
  return Array.isArray(wrapped) ? wrapped : undefined;
}

// TronWeb accepts empty-string stateMutability but crashes on non-string values.
function assertConstructorEncodable(abi: unknown): void {
  for (const entry of abiEntries(abi) ?? []) {
    const e = entry as { type?: unknown; stateMutability?: unknown } | null;
    if (e?.type !== "constructor") continue;
    if (typeof e.stateMutability !== "string") {
      throw new UsageError(
        "invalid_value",
        'the ABI constructor entry needs a string "stateMutability" ("nonpayable" or "payable"); ' +
          "solc emits it — add it by hand if the ABI was trimmed or came from solc < 0.5",
      );
    }
  }
}

export interface FeeEstimate extends Record<string, unknown> {
  feeModel: "tron-resource";
  energy: number;
}
