import type {
  TronLinkCollaborationPort,
  TronLinkRemoteRecord,
} from "../../ports/tronlink-collaboration.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway } from "../../ports/chain/tron-gateway.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type {
  NetworkDescriptor,
  TronLinkMultisigListView,
  TronLinkMultisigState,
  TronLinkMultisigTransactionView,
  TronLinkSignatureProgressView,
  TronTransactionArtifact,
  TxApprovalView,
} from "../../../domain/types/index.js";
import { ChainError, UsageError } from "../../../domain/errors/index.js";
import { TronAddress, tronHexToBase58 } from "../../../domain/address/index.js";
import { TronMultisigService } from "./multisig-service.js";

const LIST_LIMIT = 20;
const MAX_LOOKUP_RECORDS = 1000;
const LOOKUP_PAGE_SIZE = 50;

interface ValidatedRemoteRecord {
  view: TronLinkMultisigTransactionView;
  hex: string;
}

/** Secure collaboration workflow: the remote coordinator is never treated as a trust root. */
export class TronLinkMultisigService {
  readonly #address = new TronAddress();

  constructor(
    private readonly collaboration: TronLinkCollaborationPort,
    private readonly gateways: ChainGatewayProvider,
    private readonly local: TronMultisigService,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async list(network: NetworkDescriptor, address: string): Promise<TronLinkMultisigListView> {
    const page = await this.collaboration.list(network, address, {
      state: 255,
      start: 0,
      limit: LIST_LIMIT,
    });
    const gateway = this.gateways.get(network, "tron");
    const validated = page.records.map((record) => this.#validate(gateway, address, record));
    await mapWithConcurrency(validated, 4, (transaction) => this.#verifyOnChain(network, transaction));
    return {
      address,
      total: page.total,
      transactions: validated.map((transaction) => transaction.view),
    };
  }

  async create(
    network: NetworkDescriptor,
    address: string,
    unsignedHex: string,
  ) {
    const gateway = this.gateways.get(network, "tron");
    const transaction = gateway.decodeTransactionHex(unsignedHex);
    if ((transaction.signature?.length ?? 0) !== 0) {
      throw new UsageError("invalid_value", "TronLink --create requires an unsigned transaction");
    }
    const approval = await this.local.approvals(network, unsignedHex);
    if (approval.expired) throw new ChainError("tx_expired", "transaction has expired");

    const weight = await gateway.getSignWeight(transaction);
    const permission = weight.permission;
    if (!permission
      || permission.id !== approval.permission.id
      || !permission.keys.some((key) => key.address === address)) {
      throw new ChainError("not_authorized", "selected account is not a key in the transaction permission");
    }

    const visible = visibleTransaction(gateway, unsignedHex);
    await this.collaboration.create(network, address, {
      permissionName: permission.name,
      txId: approval.txId,
      rawDataJson: JSON.stringify(visible.raw_data),
      contractType: approval.contractType,
    });
    return {
      action: "create" as const,
      accepted: true as const,
      hex: unsignedHex.trim().replace(/^0x/i, "").toLowerCase(),
      transaction: approval,
    };
  }

  async sign(
    scope: TransactionScope,
    network: NetworkDescriptor,
    txId: string,
  ) {
    const address = scope.resolveAddress("tron");
    const remote = await this.#find(network, address, normalizeTxId(txId));
    if (remote.view.state !== "pending") {
      if (remote.view.signedByCurrentAccount) {
        throw new ChainError("already_signed", "this account has already signed the TronLink transaction");
      }
      throw new ChainError("invalid_value", `TronLink transaction is ${remote.view.state}, not pending`);
    }
    if (remote.view.expired) throw new ChainError("tx_expired", "transaction has expired");

    const signed = await this.local.sign(scope, network, remote.hex);
    const gateway = this.gateways.get(network, "tron");
    await this.collaboration.submit(network, signed.signer, visibleTransaction(gateway, signed.hex));
    return {
      action: "sign" as const,
      accepted: true as const,
      signer: signed.signer,
      signerWeight: signed.signerWeight,
      hex: signed.hex,
      transaction: signed.transaction,
    };
  }

  async watch(
    network: NetworkDescriptor,
    address: string,
    signal: AbortSignal,
    onPending: (count: number) => void,
  ) {
    let notifications = 0;
    await this.collaboration.watch(network, address, signal, (payload) => {
      if (!Array.isArray(payload)) return;
      const count = payload.filter((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
        const record = entry as Record<string, unknown>;
        return booleanFlag(record.is_sign, "is_sign") === false
          && safeInteger(record.state, "state", 0) === 0;
      }).length;
      if (count > 0) {
        notifications += 1;
        onPending(count);
      }
    });
    return { action: "watch" as const, address, notifications };
  }

  async #find(
    network: NetworkDescriptor,
    address: string,
    txId: string,
  ): Promise<ValidatedRemoteRecord> {
    const gateway = this.gateways.get(network, "tron");
    let start = 0;
    let total = Number.MAX_SAFE_INTEGER;
    while (start < total && start < MAX_LOOKUP_RECORDS) {
      const page = await this.collaboration.list(network, address, {
        state: 255,
        start,
        limit: LOOKUP_PAGE_SIZE,
      });
      total = page.total;
      for (const record of page.records) {
        const validated = this.#validate(gateway, address, record);
        if (validated.view.txId === txId) {
          await this.#verifyOnChain(network, validated);
          return validated;
        }
      }
      if (page.records.length === 0) break;
      start += page.records.length;
    }
    if (total > MAX_LOOKUP_RECORDS) {
      throw new ChainError(
        "not_found",
        `transaction was not found in the newest ${MAX_LOOKUP_RECORDS} TronLink records`,
      );
    }
    throw new ChainError("not_found", `TronLink transaction not found: ${txId}`);
  }

  #validate(
    gateway: TronGateway,
    currentAddress: string,
    remote: TronLinkRemoteRecord,
  ): ValidatedRemoteRecord {
    const hash = normalizeTxId(stringValue(remote.hash, "hash"));
    let hex: string;
    let transaction: TronTransactionArtifact;
    try {
      hex = gateway.encodeTransactionHex(remote.current_transaction);
      transaction = gateway.decodeTransactionHex(hex);
    } catch {
      throw new ChainError("provider_error", "TronLink returned a transaction that is not losslessly encodable");
    }
    if (transaction.txID !== hash) {
      throw new ChainError("provider_error", "TronLink record hash does not match transaction raw_data");
    }

    const contract = transaction.raw_data.contract[0];
    const contractType = stringValue(remote.contract_type, "contract_type");
    if (!contract || contract.type !== contractType) {
      throw new ChainError("provider_error", "TronLink contract_type does not match transaction raw_data");
    }
    const txOwner = normalizedAddress(
      contract.parameter?.value?.owner_address,
      "transaction owner_address",
      this.#address,
    );
    const contractData = objectValue(remote.contract_data, "contract_data");
    const metadataOwner = normalizedAddress(
      contractData.owner_address,
      "contract_data.owner_address",
      this.#address,
    );
    if (metadataOwner !== txOwner) {
      throw new ChainError("provider_error", "TronLink owner metadata does not match transaction raw_data");
    }

    const originator = normalizedAddress(remote.originator_address, "originator_address", this.#address);
    const stateCode = safeInteger(remote.state, "state", 0);
    const isSigned = booleanFlag(remote.is_sign, "is_sign");
    const state = recordState(stateCode, isSigned);
    const currentWeight = safeInteger(remote.current_weight, "current_weight", 0);
    const threshold = safeInteger(remote.threshold, "threshold", 1);
    const signatureProgress = progress(remote.signature_progress, this.#address);
    const currentProgress = signatureProgress.find((item) => item.address === currentAddress);
    if (!currentProgress) {
      throw new ChainError("not_authorized", "selected account is not a signer in this TronLink transaction");
    }
    if (currentProgress.signed !== isSigned) {
      throw new ChainError("provider_error", "TronLink is_sign disagrees with signature_progress");
    }
    const signedWeight = signatureProgress
      .filter((item) => item.signed)
      .reduce((sum, item) => sum + item.weight, 0);
    if (!Number.isSafeInteger(signedWeight) || signedWeight !== currentWeight) {
      throw new ChainError("provider_error", "TronLink current_weight disagrees with signature_progress");
    }
    const signatures = transaction.signature?.length ?? 0;
    if (signatureProgress.filter((item) => item.signed).length !== signatures) {
      throw new ChainError("provider_error", "TronLink signature_progress disagrees with transaction signatures");
    }

    const createdAt = safeInteger(transaction.raw_data.timestamp, "transaction timestamp", 0);
    const expiration = safeInteger(transaction.raw_data.expiration, "transaction expiration", 1);
    const decoded = gateway.decodeTransaction(transaction);
    return {
      hex,
      view: {
        txId: hash,
        state,
        contractType,
        originator,
        owner: txOwner,
        permission: {
          id: contract.Permission_id ?? 0,
          name: "",
          threshold,
        },
        currentWeight,
        missingWeight: Math.max(0, threshold - currentWeight),
        thresholdReached: currentWeight >= threshold,
        awaitingMySignature: stateCode === 0 && !isSigned,
        signedByCurrentAccount: isSigned,
        createdAt,
        expiration,
        expired: expiration <= this.now(),
        signatures,
        signatureProgress,
        from: decoded.from,
        to: decoded.to,
        rawAmount: decoded.rawAmount,
      },
    };
  }

  async #verifyOnChain(network: NetworkDescriptor, remote: ValidatedRemoteRecord): Promise<void> {
    const approval = await this.local.approvals(network, remote.hex);
    const signedProgress = remote.view.signatureProgress
      .filter((entry) => entry.signed)
      .map((entry) => entry.address);
    const approved = new Set(approval.approved.map((entry) => entry.address));
    if (
      approval.txId !== remote.view.txId
      || approval.contractType !== remote.view.contractType
      || approval.currentWeight !== remote.view.currentWeight
      || approval.permission.id !== remote.view.permission.id
      || approval.permission.threshold !== remote.view.permission.threshold
      || approval.signatures !== remote.view.signatures
      || approval.expiration !== remote.view.expiration
      || approved.size !== signedProgress.length
      || signedProgress.some((address) => !approved.has(address))
    ) {
      throw new ChainError(
        "provider_error",
        "TronLink transaction metadata or signatures disagree with the selected network",
      );
    }
    remote.view.permission.name = approval.permission.name;
  }
}

/** Convert address fields to visible=true JSON, then prove that protobuf bytes are unchanged. */
function visibleTransaction(gateway: TronGateway, hex: string): TronTransactionArtifact {
  const transaction = structuredClone(gateway.decodeTransactionHex(hex));
  convertAddressFields(transaction);
  transaction.visible = true;
  if (gateway.encodeTransactionHex(transaction) !== hex.trim().replace(/^0x/i, "").toLowerCase()) {
    throw new ChainError("provider_error", "visible transaction projection changed transaction bytes");
  }
  return transaction;
}

function convertAddressFields(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) convertAddressFields(item);
    return;
  }
  for (const [field, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "string" && (field === "address" || field.endsWith("_address"))) {
      (value as Record<string, unknown>)[field] = tronHexToBase58(item);
    } else {
      convertAddressFields(item);
    }
  }
}

function progress(value: unknown, addressCodec: TronAddress): TronLinkSignatureProgressView[] {
  if (!Array.isArray(value)) {
    throw new ChainError("provider_error", "TronLink signature_progress must be an array");
  }
  const addresses = new Set<string>();
  return value.map((entry, index) => {
    const item = objectValue(entry, `signature_progress[${index}]`);
    const address = normalizedAddress(item.address, `signature_progress[${index}].address`, addressCodec);
    if (addresses.has(address)) {
      throw new ChainError("provider_error", "TronLink signature_progress contains duplicate addresses");
    }
    addresses.add(address);
    const weight = safeInteger(item.weight, `signature_progress[${index}].weight`, 1);
    const signed = booleanFlag(item.is_sign, `signature_progress[${index}].is_sign`);
    const signTime = safeInteger(item.sign_time ?? 0, `signature_progress[${index}].sign_time`, 0);
    const signedAt = signTime === 0 ? null : signTime * 1000;
    if (!Number.isSafeInteger(signedAt ?? 0) || (!signed && signTime !== 0)) {
      throw new ChainError("provider_error", "TronLink signature timestamp is inconsistent");
    }
    return { address, weight, signed, signedAt };
  });
}

function recordState(code: number, signed: boolean): TronLinkMultisigState {
  if (code === 0) return signed ? "signed" : "pending";
  if (code === 1) return "success";
  if (code === 2) return "failed";
  throw new ChainError("provider_error", `TronLink returned unsupported transaction state ${code}`);
}

function normalizeTxId(value: string): string {
  const normalized = value.replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new UsageError("invalid_value", "TronLink txId must be a 32-byte hex string");
  }
  return normalized;
}

function normalizedAddress(value: unknown, field: string, codec: TronAddress): string {
  const normalized = tronHexToBase58(stringValue(value, field));
  if (!codec.validate(normalized)) {
    throw new ChainError("provider_error", `TronLink ${field} is not a valid TRON address`);
  }
  return normalized;
}

function objectValue(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ChainError("provider_error", `TronLink ${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    throw new ChainError("provider_error", `TronLink ${field} must be a non-empty string`);
  }
  return value;
}

function safeInteger(value: unknown, field: string, minimum: number): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= minimum) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed >= minimum) return parsed;
  }
  throw new ChainError("provider_error", `TronLink ${field} must be a safe integer`);
}

function booleanFlag(value: unknown, field: string): boolean {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  throw new ChainError("provider_error", `TronLink ${field} must be a boolean flag`);
}

async function mapWithConcurrency<T>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (next < values.length) {
      const index = next;
      next += 1;
      await operation(values[index]!);
    }
  });
  await Promise.all(workers);
}
