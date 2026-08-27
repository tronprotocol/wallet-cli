/**
 * TronRpcClient — thin TRON node wrapper via tronweb HTTP fullHost. Implements the
 * Broadcaster port plus TRON-specific reads, TRC10/TRC20, Stake 2.0, and contract operations.
 * (builtin TRON networks carry an HTTP fullHost; tronweb is HTTP-based.)
 */
import { providers, TronWeb, utils as tronUtils } from "tronweb";
import type { Types } from "tronweb";
import { isLosslessNumber, parse as parseLosslessJson } from "lossless-json";
import type {
  AccountPermissionsView,
  ActivePermissionView,
  BroadcastResult,
  PermissionGroupView,
  NetworkDescriptor,
  SignedTx,
  TronTransactionArtifact,
  UnsignedTx,
} from "../../../../domain/types/index.js";
import type { RpcResourceCode } from "../../../../domain/resources/index.js";
import type { Broadcaster } from "../../../../application/ports/chain/broadcaster.js";
import { assertBroadcastAllowed } from "../../../../application/services/broadcast-guard.js";
import type {
  DecodedTronTransaction,
  TronContractParameter,
  TronContractMetadata,
  TronAccount,
  TronAsset,
  TronAssetIssuance,
  TronAssetUpdate,
  TronExchange,
  TronDelegatedResource,
  TronGateway,
  TronNodeInfo,
  TronProposal,
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
import { classifyNodeRejection } from "./node-errors.js";
import { decodeTronTransaction } from "./transaction-decoder.js";
import { isDeployedContract, normalizeContractResponses } from "./contract-response.js";
import {
  proposalCreateTxJsonToPbExact,
  updateEnergyLimitTxJsonToPbExact,
} from "./proposal-protobuf.js";
import {
  decodeTransactionHex,
  encodeTransactionHex,
  normalizeTransactionHex,
  refreshTransactionIdentity,
} from "./transaction-codec.js";
import { decodeOperations } from "../../../../domain/permission/index.js";
import { addressCodec } from "../../../../domain/family/index.js";
import {
  FetchHttpTransport,
  HttpTransportError,
  httpTransportFailure,
  networkHttpConfig,
  type HttpEndpointConfig,
  type HttpTransport,
} from "../../http/index.js";

/** a valid base58 owner used as the caller for read-only (constant) contract calls. */
const TRON_READ_OWNER = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
const DEFAULT_ACTIVE_OPERATIONS =
  "7fff1fc0033ef30f000000000000000000000000000000000000000000000000";

/** 41-prefixed hex TRON address → base58; passes through values that are already base58/empty.
 *  TronGrid's native /transactions endpoint returns hex even with visible=true. */
export function hexToBase58(addr: unknown): string {
  return tronHexToBase58(addr);
}

export class TronRpcClient implements TronGateway, Broadcaster {
  #tw: InstanceType<typeof TronWeb>;
  readonly #timeoutMs: number;
  readonly #transport: HttpTransport;
  constructor(
    fullHostOrConfig: string | NetworkDescriptor | HttpEndpointConfig,
    timeoutMs = 60_000,
    transport?: HttpTransport,
  ) {
    let config: HttpEndpointConfig;
    try {
      config =
        typeof fullHostOrConfig === "string"
          ? { endpoint: fullHostOrConfig, timeoutMs, headers: {} }
          : "endpoint" in fullHostOrConfig
            ? fullHostOrConfig
            : networkHttpConfig(fullHostOrConfig, timeoutMs);
    } catch (error) {
      const failure =
        error instanceof HttpTransportError ? httpTransportFailure(error) : "invalid HTTP endpoint";
      throw new TransportError("rpc_error", `TRON RPC configuration failed: ${failure}`);
    }
    // a dummy address keeps tronweb happy for read-only/builder use (no key → cannot sign)
    const tronProvider = () => {
      const provider = new providers.HttpProvider(config.endpoint, config.timeoutMs, "", "", {
        ...config.headers,
      });
      // tronweb talks through its own axios instance, which follows redirects and re-sends the
      // headers to wherever it lands — so a credentialed request would hand the API key to
      // whatever host the endpoint points at. Mirror FetchHttpTransport's `redirect: "error"`.
      // Conditional on purpose: with nothing to leak, a provider that legitimately redirects
      // must keep working.
      if (Object.keys(config.headers).length > 0) {
        // tronweb types `instance` as request-only; the axios defaults are there at runtime.
        const axios = provider.instance as unknown as { defaults: { maxRedirects: number } };
        axios.defaults.maxRedirects = 0;
      }
      return provider;
    };
    this.#tw = new TronWeb({
      fullNode: tronProvider(),
      solidityNode: tronProvider(),
      eventServer: tronProvider(),
    });
    this.#timeoutMs = config.timeoutMs;
    this.#transport = transport ?? new FetchHttpTransport(config);
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
    assertBroadcastAllowed();
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
      throw new TransportError(
        "rpc_error",
        `TRON broadcast failed: ${redactErrorMessage((e as Error).message ?? "")}`,
      );
    }
    // tronweb does NOT throw on node rejection — it hands back the node's response verbatim, and a
    // rejected /wallet/broadcasttransaction carries no `result` field at all (only code/message/txid).
    // So acceptance must be the white-listed case: anything but an explicit `true` is a rejection.
    if (res.result !== true) {
      const reason = String(decodeTronMessage(res.message) || res.code || "rejected by node");
      // A recognised rejection gets a code an agent can branch on; everything else keeps the
      // node's own words under transaction_rejected (see node-errors.ts).
      const known = classifyNodeRejection(reason);
      throw new ChainError(
        known?.code ?? "transaction_rejected",
        known?.message ?? `TRON broadcast rejected: ${redactErrorMessage(reason)}`,
        { code: res.code, nodeMessage: redactErrorMessage(reason) },
      );
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
  ): Promise<UnsignedTx> {
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
      const response = await this.#tw.trx.getSignWeight(
        structuredClone(transaction) as Types.Transaction,
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
        // Protobuf JSON omits scalar zero values. An unsigned transaction therefore has no
        // current_weight field even though the protocol value is exactly 0.
        currentWeight: safeNodeInteger(response.current_weight ?? 0, "current_weight"),
        resultCode: String(response.result?.code ?? ""),
        message: decodeTronMessage(response.result?.message),
      };
    });
  }

  async getApprovedList(transaction: UnsignedTx): Promise<string[]> {
    return this.#wrap("getApprovedList", async () => {
      const response = await this.#tw.trx.getApprovedList(
        structuredClone(transaction) as Types.Transaction,
      );
      return (response.approved_list ?? []).map(hexToBase58);
    });
  }

  async broadcastHex(input: string): Promise<BroadcastResult> {
    assertBroadcastAllowed();
    const hex = normalizeTransactionHex(input);
    decodeTransactionHex(hex);
    const response = await this.#wrap("broadcast hex", () => this.#tw.trx.sendHexTransaction(hex));
    if (response.result !== true) {
      const reason = decodeTronMessage(response.message) || response.code || "rejected by node";
      throw new ChainError(
        "transaction_rejected",
        `TRON broadcast rejected: ${redactErrorMessage(String(reason))}`,
      );
    }
    const returnedTxId =
      response.transaction && typeof response.transaction === "object"
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
  async buildNativeTransfer(
    from: string,
    to: string,
    amountSun: string,
  ): Promise<Types.Transaction> {
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
      if (e instanceof ChainError || e instanceof UsageError || e instanceof TransportError)
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

  // ── account / query ──────────────────────────────────────────────────────────
  /** node POST returning the raw body, so the caller can parse it losslessly. */
  async #post(path: string, body: unknown): Promise<string> {
    return this.#transport.requestText({
      method: "POST",
      path,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async getAccount(address: string): Promise<TronAccount> {
    return this.#wrap("getAccount", async () => {
      return parseTronAccountResponse(
        await this.#post("/wallet/getaccount", { address: this.#tw.address.toHex(address) }),
      );
    });
  }
  async getAccountById(accountId: string): Promise<TronAccount> {
    return this.#wrap("getAccountById", async () => {
      return parseTronAccountResponse(
        await this.#post("/wallet/getaccountbyid", {
          account_id: Buffer.from(accountId, "utf8").toString("hex"),
        }),
      );
    });
  }
  async getAccountResources(address: string): Promise<Types.AccountResourceMessage> {
    return this.#wrap("getAccountResources", () => this.#tw.trx.getAccountResources(address));
  }
  async getBlock(numberOrLatest?: string): Promise<Types.Block> {
    // Guard before #wrap so a bad height surfaces as invalid_amount, not a wrapped rpc_error.
    const height =
      numberOrLatest === undefined ? undefined : this.#safeNumber(numberOrLatest, "block number");
    return this.#wrap("getBlock", async () => {
      const endpoint = height === undefined ? "getnowblock" : "getblockbynum";
      return parseTronBlockResponse(
        await this.#post(`/wallet/${endpoint}`, height === undefined ? {} : { num: height }),
      );
    });
  }
  async getTransactionById(txid: string): Promise<TronTx> {
    return this.#wrap("getTransaction", async () =>
      parseTronTx(await this.#tw.trx.getTransaction(txid)),
    );
  }
  async getTransactionInfoById(txid: string): Promise<TronTxInfo> {
    // Full-node (unconfirmed) info: available ~one block after inclusion (~3s), not after
    // solidification (~19 blocks / ~60s). So `--wait` confirms at "mined in a block" rather than
    // "irreversible" — the receipt (fee/energy/result) is already final by then. Same response shape.
    return this.#wrap("getTransactionInfo", async () =>
      parseTronTxInfo(
        normalizeTxInfoValue(
          parseLosslessJson(await this.#post("/wallet/gettransactioninfobyid", { value: txid })),
        ),
      ),
    );
  }
  decodeTransaction(transaction: TronTx): DecodedTronTransaction {
    return decodeTronTransaction(transaction);
  }

  // ── TRC20 / TRC10 ──────────────────────────────────────────────────────────────
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
    if (res.result?.result !== true) {
      const reason = decodeTronMessage(res.result?.message) || "constant call reverted";
      throw new ChainError("execution_error", `TRON ${fn} failed: ${redactErrorMessage(reason)}`);
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

  /**
   * Re-label the two node answers that mean "there is no token here", leaving every other failure
   * alone.
   *
   * This is classification, not swallowing — the distinction the getTokenInfo comment below is
   * about. A node outage, a timeout, a malformed response all still surface as themselves; only
   * "no contract at this address" and a reverted view call become token_metadata_unavailable,
   * which is the same code the EVM side reports for the same two situations. Without this, asking
   * about a non-token answered `rpc_error`, which reads as "the network is broken".
   */
  async #notAToken<T>(contract: string, method: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      const message = (e as Error).message ?? "";
      if (/smart contract is not exist|revert opcode executed/i.test(message)) {
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
        // Read the view methods by selector rather than via contract().at(): tokens deployed without a
        // published ABI (e.g. USDD on Nile) resolve to a contract object with no methods at all.
        //
        // No catch here on purpose. A method the contract does not implement is NOT an error at this
        // layer — the node answers `result: true` with an empty `constant_result`, which decodes to
        // undefined on its own. The only failures that reach this point are a transport fault and
        // "no contract at this address", and swallowing either would report a node outage as missing
        // token metadata — which callers then escalate into far more specific (and wrong) claims.
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
      const acct = await this.getAccount(address);
      const entry = (acct.assetV2 ?? []).find((a) => String(a.key) === String(assetId));
      return entry?.value ?? "0";
    });
  }
  /** `tx send --asset-id` reads its decimals here, so it gets the same identity and range checks
   *  as every other TRC10 read — this is the signing path a user is most likely to take. */
  async getTrc10Info(assetId: string): Promise<TronTokenInfo> {
    return this.#wrap("trc10 info", async () => {
      const raw = parseTronAssetResponse(
        await this.#post("/wallet/getassetissuebyid", { value: assetId }),
      );
      return assertUsableAsset(raw, assetId) as unknown as TronTokenInfo;
    });
  }

  async buildTrc20Transfer(
    from: string,
    to: string,
    contract: string,
    amount: string,
    feeLimit: string,
  ): Promise<Types.Transaction> {
    const fee = this.#safeNumber(feeLimit, "fee limit"); // guard before #wrap → invalid_amount, not rpc_error
    return this.#wrap("build trc20 transfer", async () => {
      // txLocal: build & ABI-encode the call locally so the node never supplies the calldata.
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
  ): Promise<Types.Transaction> {
    const n = this.#safeNumber(amount);
    return this.#wrap("build trc10 transfer", async () =>
      assertBuiltTx(
        await this.#tw.transactionBuilder.sendToken(to, n, assetId, from),
        "TransferAssetContract",
      ),
    );
  }

  // ── TRC10 assets ───────────────────────────────────────────────────────────────
  async getAssetById(assetId: string): Promise<TronAsset | undefined> {
    return this.#wrap("asset by id", async () => {
      // an unknown id comes back as an empty object; absence is a result, not a fault.
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
      // an account may issue at most one asset, so there is at most one entry.
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

  /**
   * AssetIssue and UnfreezeAsset are built through our own codec: TronWeb's serialiser drops every
   * frozen tranche after the first, and has no UnfreezeAssetContract at all. See ADR-0001 and
   * asset-contract-codec.ts. The node still only supplies the reference block, exactly as it does
   * for every tronweb-built transaction here.
   */
  async #buildLocally(type: string, value: Record<string, unknown>): Promise<Types.Transaction> {
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
    return assertBuiltTx(built, type) as unknown as Types.Transaction;
  }

  async buildAssetIssue(owner: string, issuance: TronAssetIssuance): Promise<Types.Transaction> {
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

  async buildAssetUnfreeze(owner: string): Promise<Types.Transaction> {
    return this.#wrap("build asset unfreeze", async () =>
      this.#buildLocally("UnfreezeAssetContract", { owner_address: this.#toHexAddress(owner) }),
    );
  }

  async buildAssetUpdate(owner: string, update: TronAssetUpdate): Promise<Types.Transaction> {
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
  ): Promise<Types.Transaction> {
    const amount = this.#safeNumber(amountSun);
    return this.#wrap("build asset participate", async () =>
      assertBuiltTx(
        await this.#tw.transactionBuilder.purchaseToken(issuer, assetId, amount, owner),
        "ParticipateAssetIssueContract",
      ),
    );
  }

  // ── Bancor exchange ────────────────────────────────────────────────────────────
  /**
   * Exchange records carry token ids in their raw byte form (`"5f"` = `_` = TRX,
   * `"31303035303338"` = `"1005038"`), and tronweb passes them through undecoded — unlike token
   * records, which it does decode. Normalise here so nothing above this layer sees hex.
   */
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
      // an unknown id comes back as an empty object rather than an error
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
  ): Promise<Types.Transaction> {
    const first = this.#safeNumber(firstBalance);
    const second = this.#safeNumber(secondBalance);
    return this.#wrap("build exchange create", async () =>
      // createTokenExchange (not createTRXExchange) for both sides: it takes the token ids
      // verbatim, so the pair keeps the order the user typed. createTRXExchange would force TRX
      // into the second slot regardless.
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
  ): Promise<Types.Transaction> {
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
  ): Promise<Types.Transaction> {
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
  ): Promise<Types.Transaction> {
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

  // ── estimate (real fee report for --dry-run) ─────────────────────────────────
  async estimateEnergy(
    from: string,
    contract: string,
    fn: string,
    params: TronContractParameter[],
  ): Promise<number> {
    return this.#wrap("estimateEnergy", async () => {
      const res = await this.#tw.transactionBuilder.triggerConstantContract(
        contract,
        fn,
        {},
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
  ): Promise<FeeEstimate> {
    const [energy, prices, resources] = await Promise.all([
      this.estimateEnergy(from, contract, fn, params),
      this.getEnergyPrices().catch(() => undefined),
      this.getAccountResources(from).catch(() => undefined),
    ]);
    return {
      feeModel: "tron-resource",
      energy,
      energyPriceSun: prices,
      availableEnergy: resources
        ? Number(resources.EnergyLimit ?? 0) - Number(resources.EnergyUsed ?? 0)
        : undefined,
    };
  }

  // ── staking (Stake 2.0) ──────────────────────────────────────────────────────
  async buildFreezeV2(
    owner: string,
    amountSun: string,
    resource: RpcResourceCode,
  ): Promise<Types.Transaction> {
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
  ): Promise<Types.Transaction> {
    const n = this.#safeNumber(amountSun);
    return this.#wrap("unfreezeBalanceV2", async () =>
      assertBuiltTx(
        await this.#tw.transactionBuilder.unfreezeBalanceV2(n, resource, owner),
        "UnfreezeBalanceV2Contract",
      ),
    );
  }
  async buildWithdrawExpireUnfreeze(owner: string): Promise<Types.Transaction> {
    return this.#wrap("withdrawExpireUnfreeze", async () =>
      assertBuiltTx(
        await this.#tw.transactionBuilder.withdrawExpireUnfreeze(owner),
        "WithdrawExpireUnfreezeContract",
      ),
    );
  }
  async buildCancelAllUnfreezeV2(owner: string): Promise<Types.Transaction> {
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
  ): Promise<Types.Transaction> {
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
  ): Promise<Types.Transaction> {
    const n = this.#safeNumber(amountSun);
    return this.#wrap("undelegateResource", async () =>
      assertBuiltTx(
        await this.#tw.transactionBuilder.undelegateResource(n, receiver, resource, owner),
        "UnDelegateResourceContract",
      ),
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
  /**
   * The witness record for `address`, or null when it is not a registered witness.
   *
   * Read from the witness LIST and filtered locally, because there is no per-address witness
   * endpoint: `/wallet/getwitnessbyaddress` does not exist on any node (POST 405 / GET 404 on both
   * mainnet and Nile), so asking for one can only ever fail. One request, no per-row fan-out —
   * 440 records / 59 KB on mainnet, 842 / 89 KB on Nile — and it runs once as a pre-flight for a
   * write, never inside a listing.
   *
   * `listwitnesses` rather than `getpaginatednowwitnesslist`: it returns EVERY witness in a single
   * response, and the rights this gates (brokerage, creating/approving proposals) belong to any
   * witness, not only the 27 currently-active SRs.
   */
  async getWitness(address: string): Promise<TronWitness | null> {
    return this.#wrap("listWitnesses", async () => {
      const raw = normalizeAccountValue(
        parseLosslessJson(await this.#post("/wallet/listwitnesses", {})),
      ) as Record<string, unknown>;
      const witnesses = Array.isArray(raw.witnesses) ? raw.witnesses : [];
      // normalizeWitness yields base58; compare against the caller's ref in the same form.
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
    parameters: Array<{ key: number; value: number | string }>,
    options: { permissionId?: number } = {},
  ): Promise<Types.Transaction> {
    return this.#wrap("createProposal", async () =>
      assertBuiltTx(
        await this.#buildLocalTransaction(
          "ProposalCreateContract",
          { owner_address: this.#tw.address.toHex(owner), parameters },
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
  ): Promise<Types.Transaction> {
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
  ): Promise<Types.Transaction> {
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
  ): Promise<Types.Transaction> {
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
  ): Promise<Types.Transaction> {
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
  ): Promise<Types.Transaction> {
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

  // ── contract ──────────────────────────────────────────────────────────────────
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
    opts: { feeLimit?: string; callValue?: string; permissionId?: number } = {},
  ): Promise<Types.Transaction> {
    // Guard before #wrap so a bad fee/callValue surfaces as invalid_amount, not a wrapped rpc_error.
    const feeLimit =
      opts.feeLimit === undefined ? undefined : this.#safeNumber(opts.feeLimit, "fee limit");
    const callValue =
      opts.callValue === undefined ? undefined : this.#safeNumber(opts.callValue, "call value");
    return this.#wrap("triggerSmartContract", async () => {
      // txLocal: ABI-encode the call client-side so the node never supplies the calldata/params.
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
      feeLimit: string;
      parameters?: unknown[];
      permissionId?: number;
    },
  ): Promise<Types.Transaction> {
    const feeLimit = this.#safeNumber(p.feeLimit, "fee limit"); // guard before #wrap → invalid_amount, not rpc_error
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
    // getContract is authoritative for existence: an empty response means no contract is deployed
    // here (e.g. a plain account). Fail as not_found rather than normalize {} into an empty contract.
    if (!isDeployedContract(contract)) {
      throw new ChainError("not_found", `no contract deployed at ${address}`);
    }
    return normalizeContractResponses(contract, info);
  }
  async buildClearContractAbi(
    owner: string,
    contract: string,
    options: { permissionId?: number } = {},
  ): Promise<Types.Transaction> {
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
  ): Promise<Types.Transaction> {
    // TronWeb 6.4.0 still rejects values above 10,000,000 in its client-side validator, while
    // java-tron and the protocol field accept a positive int64. Build the same protobuf locally
    // so valid limits such as 50,000,000 are not rejected by an obsolete SDK policy check.
    return this.#wrap("updateEnergyLimit", async () =>
      assertBuiltTx(
        await this.#buildLocalTransaction(
          "UpdateEnergyLimitContract",
          {
            owner_address: this.#tw.address.toHex(owner),
            contract_address: this.#tw.address.toHex(contract),
            // MUST be a json NUMBER, never a numeric string. java-tron rebuilds the contract from
            // `raw_data` json (it ignores raw_data_hex on the non-visible broadcast path); a string
            // fails to parse into the int64 field and it validates an EMPTY message, which surfaces as
            // the misleading "Contract validate error : No contract!" even though the address is right.
            // Proven on Nile: one signed transaction, identical raw_data_hex — number accepted, string
            // rejected. #safeNumber refuses anything Number cannot hold exactly.
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
  ): Promise<Types.Transaction> {
    return this.#wrap("updateSetting", async () =>
      assertBuiltTx(
        await this.#tw.transactionBuilder.updateSetting(contract, percent, owner, options),
        "UpdateSettingContract",
      ),
    );
  }

  /** Build a one-contract transaction using TronWeb's public protobuf codec and local ref block.
   * This is equivalent to TransactionBuilder.createTransaction but does not inherit individual
   * builder methods' stale policy limits. raw_data, raw_data_hex and txID are derived together. */
  async #buildLocalTransaction(
    type: string,
    value: Record<string, unknown>,
    permissionId?: number,
  ): Promise<Types.Transaction> {
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
    } as unknown as Types.Transaction;
  }

  // tronweb's builder params are JS numbers; strings stay exact until this last inch,
  // where we reject any value that a Number could not represent without precision loss.
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
  if (typeof value === "number")
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : "0";
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

/**
 * A proposal's parameter changes, keyed by protocol parameter id — the substance of the proposal.
 *
 * The node sends `parameters` as an ARRAY of `{key, value}` (`/wallet/listproposals`), which is the
 * only shape observed on mainnet and Nile. A map keyed by id is accepted too, because that is what
 * tronweb's typings describe and what a future gateway could hand us; both collapse to the same
 * `{ "<id>": "<value>" }` record the domain works with.
 *
 * Getting this wrong is silent: an unrecognised shape yields `{}`, so every proposal renders with
 * "no changes" and `proposal create --wait` cannot match the proposal it just made. Hence the
 * explicit array branch and the adapter-level test over a real node payload.
 */
function normalizeProposalParameters(value: unknown): Record<string, string> {
  if (Array.isArray(value)) {
    const entries = value.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const { key, value: parameterValue } = entry as { key?: unknown; value?: unknown };
      if (
        key === undefined ||
        key === null ||
        parameterValue === undefined ||
        parameterValue === null
      )
        return [];
      return [[String(key), String(parameterValue)] as const];
    });
    return Object.fromEntries(entries);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined && entry !== null)
        .map(([key, entry]) => [key, String(entry)]),
    );
  }
  return {};
}

function normalizeProposal(value: unknown): TronProposal | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = Number(raw.proposal_id ?? raw.proposalId);
  if (!Number.isSafeInteger(id) || id < 0) return null;
  const proposerAddress = hexToBase58(raw.proposer_address ?? raw.proposerAddress);
  if (!proposerAddress) return null;
  const parameters = normalizeProposalParameters(raw.parameters);
  const stateValue = raw.state;
  const states = ["PENDING", "DISAPPROVED", "APPROVED", "CANCELED"] as const;
  const state =
    typeof stateValue === "string" &&
    states.includes(stateValue.toUpperCase() as (typeof states)[number])
      ? (stateValue.toUpperCase() as (typeof states)[number])
      : (states[Number(stateValue)] ?? "PENDING");
  return {
    id,
    proposerAddress,
    parameters,
    expirationTime: Number(raw.expiration_time ?? raw.expirationTime ?? 0),
    createTime: Number(raw.create_time ?? raw.createTime ?? 0),
    approvals: (Array.isArray(raw.approvals) ? raw.approvals : []).map(hexToBase58).filter(Boolean),
    state,
  };
}

/**
 * Parse TRC10 asset JSON without coercing its int64 quantities through JS number.
 *
 * Asked with `visible: false`, so `owner_address` keeps the hex form `tronHexToBase58` expects;
 * the cost is that the node's text fields arrive hex-encoded and are decoded here — the one piece
 * of tronweb's `_parseToken` worth keeping.
 */
export function parseTronAssetResponse(text: string): TronAsset {
  return decodeAssetText(normalizeAccountValue(parseLosslessJson(text))) as TronAsset;
}

const ASSET_TEXT_KEYS = new Set(["name", "abbr", "url", "description"]);

function decodeAssetText(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeAssetText);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      ASSET_TEXT_KEYS.has(key) && typeof entry === "string"
        ? hexToUtf8(entry)
        : decodeAssetText(entry),
    ]),
  );
}

/** node text fields are hex; anything else is passed through rather than mangled. */
function hexToUtf8(value: string): string {
  if (value === "" || !/^([0-9a-fA-F]{2})+$/.test(value)) return value;
  return Buffer.from(value, "hex").toString("utf8");
}

/**
 * Amounts the chain reports having actually moved. Kept exact because a high-supply TRC10 puts
 * them above 2^53; fee and resource counters are deliberately absent, so `--wait` receipts keep
 * reporting those as numbers.
 */
const REALISED_AMOUNT_KEYS = new Set([
  "unfreeze_amount",
  "withdraw_amount",
  "exchange_received_amount",
  "exchange_inject_another_amount",
  "exchange_withdraw_another_amount",
]);

function normalizeTxInfoValue(value: unknown, key?: string): unknown {
  if (isLosslessNumber(value)) {
    const exact = value.toString();
    if (key && REALISED_AMOUNT_KEYS.has(key)) return exact;
    const number = Number(exact);
    return Number.isSafeInteger(number) ? number : exact;
  }
  if (Array.isArray(value)) return value.map((entry) => normalizeTxInfoValue(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entry]) => [
        entryKey,
        normalizeTxInfoValue(entry, entryKey),
      ]),
    );
  }
  return value;
}

/**
 * What a TRC10 record must satisfy to be usable, as opposed to merely well-formed json.
 *
 * `precision` is 0..6 and the rate pair is a positive int32 by definition of the contract — every
 * TRC10 on mainnet (5,192) and Nile (4,000) complies, so a violation is a broken or dishonest node
 * rather than a historical quirk. It is worth refusing because `precision` converts a human
 * `--amount` into the minimal units that get signed: reporting 0 where the token carries 6 moves
 * the decimal point six places on a transaction the user is about to authorise.
 *
 * An ABSENT precision is legal and means 0 — 47% of mainnet assets omit the field.
 */
const TRC10_MAX_PRECISION = 6;
const INT32_MAX = 2_147_483_647;

function assetViolation(asset: TronAsset): string | undefined {
  const precision = asset.precision;
  if (
    precision !== undefined &&
    (!Number.isInteger(precision) || precision < 0 || precision > TRC10_MAX_PRECISION)
  ) {
    return `precision ${JSON.stringify(precision)} is outside the protocol range 0..${TRC10_MAX_PRECISION}`;
  }
  for (const field of ["trx_num", "num"] as const) {
    const value = asset[field];
    if (!Number.isInteger(value) || value <= 0 || value > INT32_MAX) {
      return `${field} ${JSON.stringify(value)} is not a positive int32`;
    }
  }
  return undefined;
}

function assertUsableAsset(asset: TronAsset, requestedId?: string): TronAsset {
  // We know which id we asked for, so a record answering with another one is a mismatch however
  // self-consistent it looks — the one identity claim that can be checked without trusting the node.
  if (requestedId !== undefined && String(asset.id) !== requestedId) {
    throw new ChainError(
      "invalid_node_response",
      `asked the node for TRC10 ${requestedId} and it answered with ${JSON.stringify(asset.id)}`,
    );
  }
  const violation = assetViolation(asset);
  if (violation) {
    throw new ChainError("invalid_node_response", `TRC10 ${String(asset.id)}: ${violation}`);
  }
  return asset;
}

/**
 * `{assetIssue: [...]}` — the shape every list-ish TRC10 endpoint answers with.
 *
 * Unusable rows are dropped rather than thrown on: a list is a display surface, and one poisoned
 * record must not deny the caller the other 199. A name lookup filters the same way because its
 * single match can still reach a signing path.
 */
function assetList(text: string): TronAsset[] {
  const raw = parseTronAssetResponse(text) as unknown as { assetIssue?: unknown };
  const assets = Array.isArray(raw.assetIssue) ? (raw.assetIssue as TronAsset[]) : [];
  return assets.filter((asset) => assetViolation(asset) === undefined);
}

/** exchange records need no text decoding — #toExchange already decodes their token ids. */
function exchangeValue(text: string): Record<string, unknown> {
  return normalizeAccountValue(parseLosslessJson(text)) as Record<string, unknown>;
}

/** Parse node account JSON without first coercing 64-bit quantities through JS number. */
export function parseTronAccountResponse(text: string): TronAccount {
  return normalizeAccountValue(parseLosslessJson(text)) as TronAccount;
}

/** Parse a block without coercing protobuf int64/uint64 JSON values through JS number. */
export function parseTronBlockResponse(text: string): Types.Block {
  return normalizeLosslessValue(parseLosslessJson(text)) as Types.Block;
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
  if (
    typeof name !== "string" ||
    name.length === 0 ||
    Buffer.byteLength(name, "utf8") > 32 ||
    /\p{Cc}/u.test(name)
  ) {
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
  if (
    !Array.isArray(raw.keys) ||
    raw.keys.length === 0 ||
    raw.keys.length > 5 ||
    (constraints.exactKeys !== undefined && raw.keys.length !== constraints.exactKeys)
  ) {
    throw new ChainError("provider_error", `TRON node returned an invalid ${kind} key count`);
  }
  const threshold = safeNodeInteger(raw.threshold, `${kind}.threshold`);
  if (threshold === 0)
    throw new ChainError("provider_error", `TRON node returned zero ${kind} threshold`);
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
    throw new ChainError(
      "provider_error",
      `TRON node returned ${kind} threshold above total key weight`,
    );
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
    throw new ChainError(
      "provider_error",
      `TRON node returned invalid active[${index}] permission id`,
    );
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.operations !== "string") {
    throw new ChainError(
      "provider_error",
      `TRON node returned active[${index}] without operations`,
    );
  }
  let operations: ReturnType<typeof decodeOperations>;
  try {
    operations = decodeOperations(raw.operations);
  } catch {
    throw new ChainError(
      "provider_error",
      `TRON node returned malformed active[${index}] operations`,
    );
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
      Object.entries(value).map(([entryKey, entry]) => [
        entryKey,
        normalizeAccountValue(entry, entryKey),
      ]),
    );
  }
  return value;
}

function normalizeLosslessValue(value: unknown): unknown {
  if (isLosslessNumber(value)) {
    const exact = value.toString();
    const number = Number(exact);
    return Number.isSafeInteger(number) ? number : exact;
  }
  if (Array.isArray(value)) return value.map(normalizeLosslessValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeLosslessValue(entry)]),
    );
  }
  return value;
}

export interface FeeEstimate extends Record<string, unknown> {
  feeModel: "tron-resource";
  energy: number;
}

/** TRC20 metadata read via the contract's view methods; each field absent when the call reverts. */
/** Decode an ABI-encoded return word as an unsigned integer. */
function decodeAbiUint(hex?: string): bigint | undefined {
  if (!hex || !/^[0-9a-fA-F]+$/.test(hex)) return undefined;
  return BigInt("0x" + hex);
}

/** Decode an ABI-encoded return value as text; handles both dynamic `string` and legacy `bytes32`. */
function decodeAbiString(hex?: string): string | undefined {
  if (!hex || !/^[0-9a-fA-F]+$/.test(hex)) return undefined;
  const buf = Buffer.from(hex, "hex");
  if (buf.length === 32) return buf.toString("utf8").replace(/\0[\s\S]*$/, "") || undefined;
  if (buf.length < 64) return undefined;
  const offset = Number(BigInt("0x" + buf.subarray(0, 32).toString("hex")));
  if (!Number.isSafeInteger(offset) || offset + 32 > buf.length) return undefined;
  const length = Number(BigInt("0x" + buf.subarray(offset, offset + 32).toString("hex")));
  if (!Number.isSafeInteger(length) || offset + 32 + length > buf.length) return undefined;
  return buf.subarray(offset + 32, offset + 32 + length).toString("utf8") || undefined;
}

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
