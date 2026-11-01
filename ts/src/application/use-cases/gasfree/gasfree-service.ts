import {
  assertSubmitAdmitted,
  requestDispatchCheck,
  submitDispatchCheck,
} from "../../services/command-deadline.js";
import { sleepWithin } from "../../services/deadline-poll.js";
import { DeadlineExpiredError, type ExecutionDeadline } from "../../contracts/deadline.js";
import { gasfreeService } from "../../services/capability/predicates.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { GasFreeProvider } from "../../ports/gasfree-provider.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { SignerResolver } from "../../services/signer/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type {
  GasFreeAddressInfo,
  GasFreeAuthorization,
  GasFreeInfoView,
  GasFreeProviderConfig,
  GasFreeTokenConfig,
  GasFreeTraceView,
  GasFreeTransferRecord,
  GasFreeTransferView,
  NetworkDescriptor,
} from "../../../domain/types/index.js";
import {
  ChainError,
  CliError,
  errorMessage,
  followUp,
  inputRef,
  TransportError,
  UsageError,
} from "../../../domain/errors/index.js";
import { waitsForConfirmation } from "../../services/transaction-mode.js";
import {
  gasFreeDigest,
  gasFreeTypedData,
  normalizeGasFreeSignature,
  recoverGasFreeSigner,
} from "../../../domain/gasfree/index.js";
import { assertPositiveAmount, toBaseUnits } from "../../../domain/amounts/index.js";
import type { SigningService } from "../../services/signing/signing-service.js";
import type { RecipientResolver } from "../../services/recipient-resolver.js";

const MAX_DEADLINE_SECONDS = 86_400n;
const POLL_MS = 1_000;

export interface GasFreeTransferInput {
  to: string;
  amount: string;
  token: string;
  dryRun: boolean;
}

interface ResolvedGasFreeToken extends GasFreeTokenConfig {
  symbol: string;
  decimals: number;
}

export class GasFreeService {
  constructor(
    private readonly provider: GasFreeProvider,
    private readonly gateways: ChainGatewayProvider,
    private readonly signers: SignerResolver,
    private readonly signing: SigningService,
    private readonly recipients: RecipientResolver,
    private readonly clock: () => number = () => Date.now(),
    private readonly sleep: (
      milliseconds: number,
      deadline: ExecutionDeadline,
    ) => Promise<unknown> = (milliseconds, deadline) => sleepWithin(deadline, milliseconds),
  ) {}

  async info(scope: TransactionScope, network: NetworkDescriptor): Promise<GasFreeInfoView> {
    const owner = scope.resolveAddress("tron");
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(scope.deadline));
    const [addressInfo, tokens] = await Promise.all([
      this.provider.getAddress(network, owner, requestDispatchCheck(scope.deadline)),
      this.#tokens(scope.deadline, network),
    ]);
    if (addressInfo.ownerAddress !== owner) {
      throw new ChainError(
        "gasfree_integrity",
        "GasFree address response owner does not match the selected account",
      );
    }
    const byAddress = new Map(tokens.map((token) => [token.tokenAddress, token]));
    const views = await Promise.all(
      addressInfo.assets.map(async (asset) => {
        const token = byAddress.get(asset.tokenAddress);
        if (
          !token ||
          token.activateFee !== asset.activateFee ||
          token.transferFee !== asset.transferFee
        ) {
          throw new ChainError(
            "gasfree_integrity",
            "GasFree token and address fee metadata disagree",
          );
        }
        return {
          symbol: token.symbol,
          address: token.tokenAddress,
          decimals: token.decimals,
          activateFee: token.activateFee,
          transferFee: token.transferFee,
          balance: await gateway.getTrc20Balance(token.tokenAddress, addressInfo.gasFreeAddress),
        };
      }),
    );
    return {
      ownerAddress: owner,
      gasFreeAddress: addressInfo.gasFreeAddress,
      active: addressInfo.active,
      nonce: addressInfo.nonce,
      tokens: views,
    };
  }

  async transfer(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: GasFreeTransferInput,
  ): Promise<GasFreeTransferView> {
    const wait = waitsForConfirmation(scope.wait, !input.dryRun);
    if (!input.dryRun) {
      this.signers.assertCanSign(scope.activeAccount, "tron");
    }
    const metadata = gasfreeService(network);
    if (!metadata) {
      throw new UsageError("unsupported_network", `network ${network.id} does not support GasFree`);
    }
    const owner = scope.resolveAddress("tron");
    const recipient = this.recipients.resolve("tron", input.to);
    const [addressInfo, tokens, providers] = await Promise.all([
      this.provider.getAddress(network, owner, requestDispatchCheck(scope.deadline)),
      this.#tokens(scope.deadline, network),
      this.provider.listProviders(network, requestDispatchCheck(scope.deadline)),
    ]);
    if (addressInfo.ownerAddress !== owner) {
      throw new ChainError(
        "gasfree_integrity",
        "GasFree address response owner does not match the selected account",
      );
    }
    const token = selectToken(tokens, input.token);
    const provider = selectProvider(providers);
    const duration = BigInt(provider.defaultDeadlineDuration);
    if (duration <= 0n || duration > MAX_DEADLINE_SECONDS) {
      throw new ChainError(
        "gasfree_integrity",
        "GasFree provider deadline duration is outside the accepted range",
      );
    }
    const asset = selectAsset(addressInfo, token);
    const value = toBaseUnits(input.amount, token.decimals, token.symbol);
    assertPositiveAmount(BigInt(value), inputRef("amount"));
    const activateFee = addressInfo.active ? "0" : asset.activateFee;
    // Authorize activation plus transfer fees even when activation is already paid.
    const authorizedMaxFee = add(asset.activateFee, asset.transferFee);
    const totalDeducted = add(value, activateFee, asset.transferFee);
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(scope.deadline));
    const balance = await gateway.getTrc20Balance(token.tokenAddress, addressInfo.gasFreeAddress);
    if (BigInt(balance) < BigInt(totalDeducted)) {
      throw new ChainError(
        "insufficient_token_balance",
        "GasFree token balance is below transfer amount plus fees",
        { balance, required: totalDeducted },
      );
    }
    const authorization: GasFreeAuthorization = {
      token: token.tokenAddress,
      serviceProvider: provider.address,
      user: owner,
      receiver: recipient.address,
      value,
      maxFee: authorizedMaxFee,
      deadline: String(BigInt(Math.floor(this.clock() / 1000)) + duration),
      version: "1",
      nonce: addressInfo.nonce,
    };
    const base: GasFreeTransferView = {
      ...transferView("dry-run", authorization, token, addressInfo, activateFee, totalDeducted),
      ...(recipient.contactName ? { toContact: recipient.contactName } : {}),
    };
    if (input.dryRun) return base;
    if (addressInfo.allowSubmit === false) {
      throw new ChainError(
        "gasfree_rejected",
        "GasFree address is not currently allowed to submit transfers",
      );
    }

    const signer = this.signers.resolve(scope.activeAccount, "tron");
    if (signer.address !== owner) {
      throw new UsageError(
        "invalid_account",
        "resolved signer address changed during GasFree construction",
      );
    }
    const domain = {
      controllerChainId: metadata.controllerChainId,
      verifyingContract: metadata.verifyingContract,
    };
    const expectedDigest = gasFreeDigest(domain, authorization);
    const signed = await this.signing.sign(scope, {
      network,
      origin: "built",
      signer,
      payload: { kind: "typed-data", typedData: gasFreeTypedData(domain, authorization) },
    });
    const reportedDigest = signed.digest.replace(/^0x/i, "").toLowerCase();
    if (
      !/^[0-9a-f]{64}$/.test(reportedDigest) ||
      reportedDigest !== bytesToHex(expectedDigest) ||
      signed.primaryType !== "PermitTransfer"
    ) {
      throw new ChainError(
        "signing_rejected",
        "GasFree signer did not sign the expected PermitTransfer digest",
      );
    }
    let signature: string;
    let recovered: string;
    try {
      signature = normalizeGasFreeSignature(signed.signature);
      recovered = recoverGasFreeSigner(expectedDigest, signature);
    } catch {
      throw new ChainError("signing_rejected", "GasFree signer returned an invalid signature");
    }
    if (recovered !== owner) {
      throw new ChainError(
        "signing_rejected",
        "GasFree signature does not recover to the selected account",
      );
    }

    assertSubmitAdmitted(scope.deadline);
    let submitted: GasFreeTransferRecord;
    try {
      submitted = await this.provider.submitTransfer(
        network,
        { ...authorization, sig: signature },
        submitDispatchCheck(scope.deadline),
      );
    } catch (error) {
      throw uncertainSubmit(error, network, authorization, token, addressInfo, expectedDigest);
    }
    assertAccepted(submitted, authorization, addressInfo.gasFreeAddress, { traceId: submitted.id });
    const accepted: GasFreeTransferView = {
      ...base,
      stage: "submitted",
      traceId: submitted.id,
      state: submitted.state,
    };
    if (!wait) return accepted;
    const terminal = await this.#wait(
      scope,
      network,
      submitted,
      authorization,
      addressInfo.gasFreeAddress,
    );
    if (!terminal) return accepted;
    const settledAmount = terminal.txnAmount ?? accepted.amount;
    const settledServiceFee = terminal.txnTransferFee ?? accepted.serviceFee;
    const settledActivateFee = terminal.txnActivateFee ?? accepted.activateFee;
    return {
      ...accepted,
      stage: terminal.state === "SUCCEED" ? "confirmed" : "failed",
      state: terminal.state,
      amount: settledAmount,
      serviceFee: settledServiceFee,
      activateFee: settledActivateFee,
      totalDeducted:
        terminal.txnTotalCost ?? add(settledAmount, settledServiceFee, settledActivateFee),
      ...(terminal.txnHash ? { txId: terminal.txnHash } : {}),
      ...(terminal.failureReason ? { failureReason: terminal.failureReason } : {}),
    };
  }

  async trace(
    deadline: ExecutionDeadline,
    network: NetworkDescriptor,
    traceId: string,
  ): Promise<GasFreeTraceView> {
    const record = await this.provider.trace(network, traceId, requestDispatchCheck(deadline));
    assertFeeIntegrity(record, record.maxFee);
    const token = (await this.#tokens(deadline, network)).find(
      (item) => item.tokenAddress === record.tokenAddress,
    );
    if (!token) {
      throw new ChainError(
        "gasfree_integrity",
        "trace token is not in the current GasFree token configuration",
      );
    }
    const serviceFee = record.txnTransferFee ?? record.estimatedTransferFee ?? "0";
    const activateFee = record.txnActivateFee ?? record.estimatedActivateFee ?? "0";
    return {
      traceId: record.id,
      state: record.state,
      ...(record.txnHash ? { txId: record.txnHash } : {}),
      token: token.symbol,
      tokenAddress: token.tokenAddress,
      decimals: token.decimals,
      amount: record.txnAmount ?? record.amount,
      serviceFee,
      activateFee,
      totalDeducted:
        record.txnTotalCost ??
        record.estimatedTotalCost ??
        add(record.amount, serviceFee, activateFee),
      from: record.gasFreeAddress,
      owner: record.accountAddress,
      to: record.targetAddress,
      nonce: record.nonce,
      ...(record.failureReason ? { failureReason: record.failureReason } : {}),
    };
  }

  async #tokens(
    deadline: ExecutionDeadline,
    network: NetworkDescriptor,
  ): Promise<ResolvedGasFreeToken[]> {
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(deadline));
    const tokens = await this.provider.listTokens(network, requestDispatchCheck(deadline));
    return Promise.all(
      tokens.map(async (token) => {
        const info = await gateway.getTokenInfo(token.tokenAddress);
        const symbol = typeof info.symbol === "string" ? info.symbol : undefined;
        const decimals = info.decimals;
        if (
          !symbol ||
          decimals === undefined ||
          !Number.isInteger(decimals) ||
          decimals < 0 ||
          decimals > 255
        ) {
          throw new ChainError(
            "gasfree_integrity",
            `token metadata is incomplete for ${token.tokenAddress}`,
          );
        }
        if (
          (token.symbol !== undefined && token.symbol !== symbol) ||
          (token.decimals !== undefined && token.decimals !== decimals)
        ) {
          throw new ChainError(
            "gasfree_integrity",
            `provider token metadata disagrees with the TRC20 contract for ${token.tokenAddress}`,
          );
        }
        return { ...token, symbol, decimals };
      }),
    );
  }

  // Preserve the submitted receipt on polling failure, except for integrity violations.
  async #wait(
    scope: TransactionScope,
    network: NetworkDescriptor,
    initial: GasFreeTransferRecord,
    authorization: GasFreeAuthorization,
    gasFreeAddress: string,
  ): Promise<GasFreeTransferRecord | undefined> {
    const { deadline } = scope;
    const traceContext = { traceId: initial.id };
    let previous = initial.state;
    if (previous === "SUCCEED" || previous === "FAILED") return initial;
    for (;;) {
      const beforeSleep = deadline.remainingMs();
      if (beforeSleep > 0) await this.sleep(Math.min(POLL_MS, beforeSleep), deadline);
      // No trace is sent once the deadline has expired.
      if (deadline.expired()) {
        scope.warn(
          errorMessage`GasFree transfer ${initial.id} did not finish before the command's time limit; returning submitted`,
        );
        return undefined;
      }
      let current: GasFreeTransferRecord;
      try {
        current = await this.provider.trace(network, initial.id, requestDispatchCheck(deadline));
      } catch (error) {
        if (isRetryablePoll(error)) continue;
        if (error instanceof CliError && error.code === "gasfree_integrity") throw error;
        scope.warn(
          errorMessage`GasFree trace could not be polled (${
            error instanceof CliError ? error.code : "provider_error"
          }); returning submitted — reconcile with \`${followUp("gasfree-trace", initial.id)}\``,
        );
        return undefined;
      }
      if (current.id !== initial.id) {
        throw new ChainError(
          "gasfree_integrity",
          "GasFree trace id changed while polling",
          traceContext,
        );
      }
      assertAccepted(current, authorization, gasFreeAddress, traceContext);
      if (stateRank(current.state) < stateRank(previous)) {
        throw new ChainError(
          "gasfree_integrity",
          "GasFree state regressed while polling",
          traceContext,
        );
      }
      previous = current.state;
      if (current.state === "SUCCEED" || current.state === "FAILED") {
        return current;
      }
    }
  }
}

// Refusals the provider states before acting; any other failure after dispatch may have been accepted.
const DEFINITE_SUBMIT_REFUSALS = new Set([
  "gasfree_auth_failed",
  "gasfree_rejected",
  "provider_rate_limited",
]);

// The signed authorization stays valid until its deadline, so an unknown submit keeps what is needed
// to reconcile it, never the signature.
function uncertainSubmit(
  error: unknown,
  network: NetworkDescriptor,
  authorization: GasFreeAuthorization,
  token: ResolvedGasFreeToken,
  address: GasFreeAddressInfo,
  digest: Uint8Array,
): unknown {
  if (
    error instanceof DeadlineExpiredError ||
    (error instanceof CliError &&
      (error.kind === "usage" || DEFINITE_SUBMIT_REFUSALS.has(error.code)))
  ) {
    return error;
  }
  const code = error instanceof CliError && error.code === "timeout" ? "timeout" : "provider_error";
  return new TransportError(
    code,
    "GasFree submit outcome is unknown and no trace id is known; check the GasFree nonce before signing another transfer",
    {
      paymentStatus: "unknown",
      retryPayment: false,
      network: network.id,
      serviceProvider: authorization.serviceProvider,
      owner: authorization.user,
      from: address.gasFreeAddress,
      to: authorization.receiver,
      token: token.symbol,
      tokenAddress: authorization.token,
      amount: authorization.value,
      authorizedMaxFee: authorization.maxFee,
      nonce: authorization.nonce,
      deadline: authorization.deadline,
      permitDigest: `0x${bytesToHex(digest)}`,
    },
  );
}

function isRetryablePoll(error: unknown): boolean {
  return error instanceof TransportError || (error instanceof CliError && error.code === "timeout");
}

function selectToken(tokens: ResolvedGasFreeToken[], symbol: string): ResolvedGasFreeToken {
  const matches = tokens.filter((token) => token.symbol.toLowerCase() === symbol.toLowerCase());
  if (matches.length === 0) {
    throw new UsageError("unsupported_token", `GasFree provider does not support token: ${symbol}`);
  }
  if (matches.length > 1) {
    throw new ChainError("gasfree_integrity", `GasFree token symbol is ambiguous: ${symbol}`);
  }
  return matches[0]!;
}

function selectProvider(providers: GasFreeProviderConfig[]): GasFreeProviderConfig {
  if (providers.length === 0) {
    throw new ChainError("gasfree_integrity", "GasFree provider configuration is empty");
  }
  return providers[0]!;
}

function selectAsset(address: GasFreeAddressInfo, token: ResolvedGasFreeToken) {
  const matches = address.assets.filter((asset) => asset.tokenAddress === token.tokenAddress);
  if (matches.length !== 1) {
    throw new ChainError(
      "gasfree_integrity",
      "GasFree address asset configuration is missing or ambiguous",
    );
  }
  const asset = matches[0]!;
  if (asset.activateFee !== token.activateFee || asset.transferFee !== token.transferFee) {
    throw new ChainError("gasfree_integrity", "GasFree fee metadata disagrees across endpoints");
  }
  return asset;
}

function transferView(
  stage: GasFreeTransferView["stage"],
  authorization: GasFreeAuthorization,
  token: ResolvedGasFreeToken,
  address: GasFreeAddressInfo,
  activateFee: string,
  totalDeducted: string,
): GasFreeTransferView {
  return {
    kind: "gasfree-transfer",
    stage,
    token: token.symbol,
    tokenAddress: token.tokenAddress,
    decimals: token.decimals,
    amount: authorization.value,
    serviceFee: token.transferFee,
    activateFee,
    authorizedMaxFee: authorization.maxFee,
    totalDeducted,
    owner: authorization.user,
    from: address.gasFreeAddress,
    to: authorization.receiver,
    serviceProvider: authorization.serviceProvider,
    nonce: authorization.nonce,
    deadline: authorization.deadline,
  };
}

function assertAccepted(
  record: GasFreeTransferRecord,
  authorization: GasFreeAuthorization,
  gasFreeAddress: string,
  // Keep the trace ID in error details for reconciliation.
  context?: object,
): void {
  const deadlineMatches =
    record.expiredAt === undefined ||
    BigInt(record.expiredAt) === BigInt(authorization.deadline) * 1000n;
  if (
    record.tokenAddress !== authorization.token ||
    record.providerAddress !== authorization.serviceProvider ||
    record.accountAddress !== authorization.user ||
    record.targetAddress !== authorization.receiver ||
    record.gasFreeAddress !== gasFreeAddress ||
    record.amount !== authorization.value ||
    record.nonce !== authorization.nonce ||
    (record.maxFee !== undefined && record.maxFee !== authorization.maxFee) ||
    !deadlineMatches ||
    (record.txnAmount !== undefined && record.txnAmount !== authorization.value)
  ) {
    throw new ChainError(
      "gasfree_integrity",
      "GasFree submit receipt does not match the signed authorization",
      context,
    );
  }
  assertFeeIntegrity(record, authorization.maxFee, context);
}

// Bound provider estimates and final charges by the signed maxFee when available.
function assertFeeIntegrity(
  record: GasFreeTransferRecord,
  authorizedMaxFee?: string,
  context?: object,
): void {
  const feeSets = [
    [
      record.estimatedTransferFee,
      record.estimatedActivateFee,
      record.estimatedTotalFee,
      record.estimatedTotalCost,
    ],
    [record.txnTransferFee, record.txnActivateFee, record.txnTotalFee, record.txnTotalCost],
  ] as const;
  for (const [transfer, activate, totalFee, totalCost] of feeSets) {
    const componentTotal =
      transfer !== undefined && activate !== undefined
        ? BigInt(transfer) + BigInt(activate)
        : undefined;
    const observedTotal = totalFee === undefined ? componentTotal : BigInt(totalFee);
    if (
      observedTotal !== undefined &&
      authorizedMaxFee !== undefined &&
      observedTotal > BigInt(authorizedMaxFee)
    ) {
      throw new ChainError(
        "gasfree_integrity",
        "GasFree provider fee exceeds the signed maxFee",
        context,
      );
    }
    if (
      componentTotal !== undefined &&
      totalFee !== undefined &&
      componentTotal !== BigInt(totalFee)
    ) {
      throw new ChainError(
        "gasfree_integrity",
        "GasFree provider fee components do not match the total fee",
        context,
      );
    }
    if (
      observedTotal !== undefined &&
      totalCost !== undefined &&
      BigInt(record.amount) + observedTotal !== BigInt(totalCost)
    ) {
      throw new ChainError(
        "gasfree_integrity",
        "GasFree provider total cost does not match amount plus fees",
        context,
      );
    }
  }
}

function add(...values: string[]): string {
  return values.reduce((sum, value) => sum + BigInt(value), 0n).toString();
}

function stateRank(state: GasFreeTransferRecord["state"]): number {
  return {
    WAITING: 0,
    INPROGRESS: 1,
    CONFIRMING: 2,
    SUCCEED: 3,
    FAILED: 3,
  }[state];
}
