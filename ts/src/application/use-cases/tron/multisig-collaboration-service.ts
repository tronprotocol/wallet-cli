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
} from "../../../domain/types/index.js";
import { ChainError, CliError, UsageError } from "../../../domain/errors/index.js";
import { TronAddress, tronHexToBase58 } from "../../../domain/address/index.js";
import { TronMultisigService } from "./multisig-service.js";
import { normalizeTxHash } from "../../../domain/family/index.js";

const LIST_LIMIT = 20;
const MAX_LOOKUP_RECORDS = 1000;
const LOOKUP_PAGE_SIZE = 50;

interface ValidatedRemoteRecord {
  view: TronLinkMultisigTransactionView;
  hex: string;
}

// Verify TronLink transaction bytes and approval claims independently.
export class TronMultisigCollaborationService {
  readonly #address = new TronAddress();

  constructor(
    private readonly collaboration: TronLinkCollaborationPort,
    private readonly gateways: ChainGatewayProvider,
    private readonly multisig: TronMultisigService,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async list(network: NetworkDescriptor, address: string): Promise<TronLinkMultisigListView> {
    const page = await this.collaboration.list(network, address, {
      state: "all",
      start: 0,
      limit: LIST_LIMIT,
    });
    const gateway = this.gateways.get(network, "tron");
    // Skip undecodable rows when listing; signing still rejects them.
    const validated: ValidatedRemoteRecord[] = [];
    let unreadable = 0;
    for (const entry of page.entries) {
      if (entry.kind === "malformed") throw entry.error;
      try {
        validated.push(this.#validate(gateway, address, entry.record));
      } catch (error) {
        if (!isUndecodable(error)) throw error;
        unreadable += 1;
      }
    }
    // List chain disagreements as unverified; propagate other verification failures.
    await mapWithConcurrency(validated, 4, async (transaction) => {
      try {
        await this.#verifyOnChain(network, address, transaction);
      } catch (error) {
        if (!isChainDisagreement(error)) throw error;
        transaction.view.unverifiedReason = error.message;
        // An unverified row must not request this account's signature.
        transaction.view.awaitingMySignature = false;
      }
    });
    return {
      address,
      total: page.total,
      unreadable,
      transactions: validated.map((transaction) => transaction.view),
    };
  }

  // TronLink requires an initial signature to open a collection.
  async create(scope: TransactionScope, network: NetworkDescriptor, unsignedHex: string) {
    const gateway = this.gateways.get(network, "tron");
    const transaction = gateway.decodeTransactionHex(unsignedHex);
    if ((transaction.signature?.length ?? 0) !== 0) {
      throw new UsageError("invalid_value", "TronLink --create requires an unsigned transaction");
    }

    const signed = await this.multisig.signChecked(scope, network, unsignedHex);
    await this.collaboration.submit(
      network,
      signed.signer,
      visibleTransaction(gateway, signed.hex),
    );
    return {
      action: "create" as const,
      accepted: true as const,
      signer: signed.signer,
      signerWeight: signed.signerWeight,
      hex: signed.hex,
      transaction: signed.approval,
    };
  }

  async sign(scope: TransactionScope, network: NetworkDescriptor, txId: string) {
    const address = scope.resolveAddress("tron");
    const remote = await this.#find(network, address, normalizeTxId(txId));
    if (remote.view.expired) throw new ChainError("tx_expired", "transaction has expired");
    if (remote.view.state !== "pending") {
      if (remote.view.signedByCurrentAccount) {
        throw new ChainError(
          "already_signed",
          "this account has already signed the TronLink transaction",
        );
      }
      throw new ChainError(
        "invalid_value",
        `TronLink transaction is ${remote.view.state}, not pending`,
      );
    }

    const signed = await this.multisig.signChecked(scope, network, remote.hex);
    const gateway = this.gateways.get(network, "tron");
    await this.collaboration.submit(
      network,
      signed.signer,
      visibleTransaction(gateway, signed.hex),
    );
    return {
      action: "sign" as const,
      accepted: true as const,
      signer: signed.signer,
      signerWeight: signed.signerWeight,
      hex: signed.hex,
      transaction: signed.approval,
    };
  }

  async watch(
    network: NetworkDescriptor,
    address: string,
    signal: AbortSignal,
    onPending: (count: number) => void,
  ) {
    let notifications = 0;
    await this.collaboration.watch(network, address, signal, (count) => {
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
        state: "all",
        start,
        limit: LOOKUP_PAGE_SIZE,
      });
      total = page.total;
      for (const entry of page.entries) {
        // Filter by claimed hash, then validate it against the transaction bytes.
        if (entry.claimedTxId !== txId) continue;
        if (entry.kind === "malformed") throw entry.error;
        const validated = this.#validate(gateway, address, entry.record);
        await this.#verifyOnChain(network, address, validated);
        return validated;
      }
      if (page.entries.length === 0) break;
      start += page.entries.length;
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
    let hex: string;
    let transaction: TronTransactionArtifact;
    try {
      hex = gateway.encodeTransactionJson(remote.currentTransaction).hex;
      transaction = gateway.decodeTransactionHex(hex);
    } catch (error) {
      throw new ChainError(
        "invalid_transaction",
        `this client cannot reconstruct the TronLink transaction bytes: ${reason(error)}`,
      );
    }
    if (transaction.txID !== remote.txId) {
      throw new ChainError(
        "provider_error",
        "TronLink record hash does not match transaction raw_data",
      );
    }

    const contract = transaction.raw_data.contract[0];
    const contractType = remote.contractType;
    if (!contract || contract.type !== contractType) {
      throw new ChainError(
        "provider_error",
        "TronLink contract_type does not match transaction raw_data",
      );
    }
    const txOwner = normalizedAddress(
      contract.parameter?.value?.owner_address,
      "transaction owner_address",
      this.#address,
    );
    if (remote.ownerAddress !== txOwner) {
      throw new ChainError(
        "provider_error",
        "TronLink owner metadata does not match transaction raw_data",
      );
    }

    const isSigned = remote.signed;
    const state = recordState(remote.status, isSigned);
    const currentWeight = remote.currentWeight;
    const threshold = remote.threshold;
    const signatureProgress = progress(remote.signatureProgress);
    const currentProgress = signatureProgress.find((item) => item.address === currentAddress);
    if (!currentProgress) {
      throw new ChainError(
        "not_authorized",
        "selected account is not a signer in this TronLink transaction",
      );
    }
    if (currentProgress.signed !== isSigned) {
      throw new ChainError("provider_error", "TronLink is_sign disagrees with signature_progress");
    }
    const signedWeight = signatureProgress
      .filter((item) => item.signed)
      .reduce((sum, item) => sum + item.weight, 0);
    if (!Number.isSafeInteger(signedWeight) || signedWeight !== currentWeight) {
      throw new ChainError(
        "provider_error",
        "TronLink current_weight disagrees with signature_progress",
      );
    }
    const signatures = transaction.signature?.length ?? 0;
    if (signatureProgress.filter((item) => item.signed).length !== signatures) {
      throw new ChainError(
        "provider_error",
        "TronLink signature_progress disagrees with transaction signatures",
      );
    }

    const createdAt = safeInteger(transaction.raw_data.timestamp, "transaction timestamp", 0);
    const expiration = safeInteger(transaction.raw_data.expiration, "transaction expiration", 1);
    const decoded = gateway.decodeTransaction(transaction);
    return {
      hex,
      view: {
        // Chain approval verification is still pending.
        verified: false,
        txId: remote.txId,
        state,
        contractType,
        originator: remote.originatorAddress,
        owner: txOwner,
        permission: {
          id: contract.Permission_id ?? 0,
          name: "",
          threshold,
        },
        currentWeight,
        missingWeight: Math.max(0, threshold - currentWeight),
        thresholdReached: currentWeight >= threshold,
        awaitingMySignature: remote.status === "open" && !isSigned,
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

  async #verifyOnChain(
    network: NetworkDescriptor,
    currentAddress: string,
    remote: ValidatedRemoteRecord,
  ): Promise<void> {
    const gateway = this.gateways.get(network, "tron");
    // approvals checks the reference block, so no permission is read for another chain's record.
    const approval = await this.multisig.approvals(network, remote.hex);
    const signWeight = await gateway.getSignWeight(gateway.decodeTransactionHex(remote.hex));
    const signedProgress = remote.view.signatureProgress
      .filter((entry) => entry.signed)
      .map((entry) => entry.address);
    const approved = new Set(approval.approved.map((entry) => entry.address));
    if (
      approval.txId !== remote.view.txId ||
      approval.contractType !== remote.view.contractType ||
      approval.currentWeight !== remote.view.currentWeight ||
      approval.permission.id !== remote.view.permission.id ||
      approval.permission.threshold !== remote.view.permission.threshold ||
      approval.signatures !== remote.view.signatures ||
      approval.expiration !== remote.view.expiration ||
      approved.size !== signedProgress.length ||
      signedProgress.some((address) => !approved.has(address))
    ) {
      throw new ChainError(
        "provider_error",
        "TronLink transaction metadata or signatures disagree with the selected network",
      );
    }

    // Validate unsigned roster entries too, and replace all weights with chain values.
    const onChainWeight = new Map(
      (signWeight.permission?.keys ?? []).map((key) => [key.address, key.weight] as const),
    );
    if (!onChainWeight.has(currentAddress)) {
      throw new ChainError(
        "not_authorized",
        "selected account is not a key in the transaction permission",
      );
    }
    // The remote roster may omit on-chain keys; validate every entry it does include.
    for (const entry of remote.view.signatureProgress) {
      const weight = onChainWeight.get(entry.address);
      if (weight === undefined) {
        throw new ChainError(
          "provider_error",
          "TronLink lists a signer that is not a key in the on-chain permission",
        );
      }
      entry.weight = weight;
    }
    // Recompute the total after replacing provider weights with chain weights.
    const signedWeight = remote.view.signatureProgress
      .filter((entry) => entry.signed)
      .reduce((sum, entry) => sum + entry.weight, 0);
    if (signedWeight !== approval.currentWeight) {
      throw new ChainError(
        "provider_error",
        "TronLink per-signer weights disagree with the on-chain permission",
      );
    }
    remote.view.permission.name = approval.permission.name;
    remote.view.verified = true;
  }
}

// Skip decoding failures only; decoded records with inconsistent metadata must fail.
function isUndecodable(error: unknown): error is ChainError {
  return error instanceof ChainError && error.code === "invalid_transaction";
}

function reason(error: unknown): string {
  return error instanceof CliError ? error.message : "unrecognized encoding";
}

function isChainDisagreement(error: unknown): error is ChainError {
  return (
    error instanceof ChainError &&
    (error.code === "provider_error" ||
      error.code === "not_authorized" ||
      error.code === "chain_id_mismatch")
  );
}

// visible=true uses base58 addresses; the signed protobuf bytes must stay unchanged.
function visibleTransaction(gateway: TronGateway, hex: string): TronTransactionArtifact {
  const transaction = structuredClone(gateway.decodeTransactionHex(hex));
  convertAddressFields(transaction);
  transaction.visible = true;
  if (gateway.encodeTransactionHex(transaction) !== hex.trim().replace(/^0x/i, "").toLowerCase()) {
    throw new ChainError(
      "provider_error",
      "visible transaction projection changed transaction bytes",
    );
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

// Copies the entries: on-chain verification replaces their weights.
function progress(entries: TronLinkSignatureProgressView[]): TronLinkSignatureProgressView[] {
  const addresses = new Set<string>();
  return entries.map((entry) => {
    if (addresses.has(entry.address)) {
      throw new ChainError(
        "provider_error",
        "TronLink signature_progress contains duplicate addresses",
      );
    }
    addresses.add(entry.address);
    if (!entry.signed && entry.signedAt !== null) {
      throw new ChainError("provider_error", "TronLink signature timestamp is inconsistent");
    }
    return { ...entry };
  });
}

function recordState(
  status: TronLinkRemoteRecord["status"],
  signed: boolean,
): TronLinkMultisigState {
  if (status === "open") return signed ? "signed" : "pending";
  return status;
}

function normalizeTxId(value: string): string {
  const normalized = normalizeTxHash("tron", value);
  if (normalized === undefined) {
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
