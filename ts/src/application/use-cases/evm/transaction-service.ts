import type {
  AccountRef,
  EvmFeeReport,
  EvmSignedTx,
  EvmUnsignedTx,
  NetworkDescriptor,
  TxInfoView,
  TxStatusView,
} from "../../../domain/types/index.js";
import { ChainError, ExecutionError } from "../../../domain/errors/index.js";
import { assertEvmTransactionChain } from "../../services/signing/chain-identity.js";
import { authoritativeTxId, submitWithTxId } from "../../services/broadcast-identity.js";
import { FAMILIES } from "../../../domain/family/index.js";
import {
  fromBaseUnits,
  positiveBaseUnits,
  toBaseUnits,
  baseUnitAmount,
  type Wei,
} from "../../../domain/amounts/index.js";
import { evmConfirmation } from "../../services/evm-confirmation.js";
import { confirmationsOf } from "../../services/confirmations.js";
import { buildEvmUnsignedTx } from "./tx-build.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type {
  EvmGateway,
  EvmRawTransaction,
  EvmTxView,
} from "../../ports/chain/gateway-provider.js";
import type { TokenRepository } from "../../ports/token-repository.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import type { RecipientResolver } from "../../services/recipient-resolver.js";
import {
  outcomeData,
  transactionMode,
  transactionRequiresSigner,
  type TransactionModeInput,
} from "../../services/transaction-mode.js";

type EvmTokenMetadata = Awaited<ReturnType<EvmGateway["getErc20Metadata"]>>;

export interface EvmSendInput extends TransactionModeInput {
  to: string;
  token?: string;
  contract?: string;
  /** the token's decimals, resolved from the address book by the caller. */
  decimals?: number;
  amount?: string;
  rawAmount?: string;
  gasLimit?: string;
  maxFee?: Wei;
  priorityFee?: Wei;
  nonce?: number;
}

export class EvmTransactionService {
  constructor(
    private readonly gateways: ChainGatewayProvider,
    private readonly tokens: TokenRepository,
    private readonly pipeline: TxPipeline,
    private readonly recipients: RecipientResolver,
  ) {}

  async send(scope: TransactionScope, network: NetworkDescriptor, input: EvmSendInput) {
    if (transactionRequiresSigner(input)) this.pipeline.assertCanSign(scope.activeAccount, "evm");
    const gateway = this.gateways.get(network, "evm");
    const recipient = this.recipients.resolve("evm", input.to);
    const transfer = await this.resolveTransfer(gateway, network.id, scope.activeAccount, input);
    positiveBaseUnits(transfer.rawAmount, "amount");

    // Keep fee metadata outside the transaction echoed by dry-run/build-only.
    let plan = {} as EvmFeeReport;
    let nonce: number | undefined;
    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      confirm: evmConfirmation(gateway, scope),
      artifact: (tx) => gateway.encodeTransactionHex(tx),
      build: async (from) => {
        const { tx, fee } = await this.#build(
          scope,
          gateway,
          network,
          from,
          recipient.address,
          transfer,
          input,
        );
        plan = fee;
        nonce = tx.nonce;
        return tx;
      },
      estimate: async () => plan,
    });

    return {
      kind: "send" as const,
      ...outcomeData(outcome),
      ...(nonce === undefined ? {} : { nonce }),
      rawAmount: transfer.rawAmount,
      token: transfer.symbol,
      decimals: transfer.decimals,
      contract: transfer.contract,
      to: recipient.address,
      ...(recipient.contactName ? { toContact: recipient.contactName } : {}),
    };
  }

  // Scale tokens by their own decimals; raw amounts are already in base units.
  private async resolveTransfer(
    gateway: EvmGateway,
    networkId: string,
    account: AccountRef,
    input: EvmSendInput,
  ) {
    let contract = input.contract;
    let decimals = input.decimals;
    let symbol: string | undefined;
    if (input.token) {
      const entry = this.tokens
        .effective(networkId, account)
        .find((t) => t.symbol.toLowerCase() === input.token!.toLowerCase());
      if (!entry || entry.kind !== "erc20") {
        throw new ExecutionError(
          "token_metadata_unavailable",
          `${input.token} is not an ERC-20 token on ${networkId}`,
        );
      }
      contract = entry.id;
      decimals = entry.decimals;
      symbol = entry.symbol;
    }
    if (input.rawAmount !== undefined) {
      return { contract, decimals, symbol, rawAmount: input.rawAmount };
    }
    if (contract === undefined) {
      const native = FAMILIES.evm.nativeDecimals;
      return {
        contract,
        decimals,
        symbol,
        rawAmount: toBaseUnits(input.amount!, native, "amount"),
      };
    }
    if (decimals === undefined) {
      // Query unlisted contracts for decimals; guessing could transfer the wrong amount.
      const meta = await gateway.getErc20Metadata(contract).catch(() => ({}) as EvmTokenMetadata);
      decimals = meta.decimals;
      if (symbol === undefined) symbol = meta.symbol;
    }
    if (decimals === undefined) {
      throw new ExecutionError(
        "token_metadata_unavailable",
        `could not establish decimals for ${contract}: it did not answer decimals() and is not in the address book. Add it with \`token add --contract ${contract}\`, or pass --raw-amount in base units.`,
      );
    }
    return {
      contract,
      decimals,
      symbol,
      rawAmount: toBaseUnits(input.amount!, decimals, "token"),
    };
  }

  // Metadata failure preserves the transfer’s base-unit amount.
  async #erc20Parties(
    gateway: EvmGateway,
    contract: string,
    transfer: { to: string; rawAmount: string },
  ) {
    const meta = await gateway
      .getErc20Metadata(contract)
      .catch(() => ({}) as { symbol?: string; decimals?: number });
    return {
      to: transfer.to,
      contract,
      ...(meta.symbol === undefined ? {} : { symbol: meta.symbol }),
      rawAmount: transfer.rawAmount,
      amount:
        meta.decimals === undefined
          ? transfer.rawAmount
          : fromBaseUnits(transfer.rawAmount, meta.decimals),
    };
  }

  async #build(
    scope: TransactionScope,
    gateway: EvmGateway,
    network: NetworkDescriptor,
    from: string,
    to: string,
    transfer: { contract?: string; rawAmount: string },
    input: EvmSendInput,
  ): Promise<{ tx: EvmUnsignedTx; fee: EvmFeeReport }> {
    // ERC20 recipient and amount belong in calldata; native value must be zero.
    const call = transfer.contract
      ? {
          to: transfer.contract,
          value: "0",
          data: gateway.encodeErc20Transfer(to, baseUnitAmount(transfer.rawAmount)),
        }
      : { to, value: transfer.rawAmount };

    const built = await buildEvmUnsignedTx({
      gateway,
      network,
      from,
      call,
      input,
      dryRun: input.dryRun,
    });
    for (const warning of built.warnings ?? []) scope.warn(warning);
    return built;
  }

  // Accept unsigned serialization only: an EVM transaction carries exactly one signature.
  async sign(
    scope: TransactionScope,
    network: NetworkDescriptor,
    hex: string,
  ): Promise<{ kind: "sign"; signed: EvmSignedTx } & Record<string, unknown>> {
    const parsed = this.gateways.get(network, "evm").decodeRawTransaction(hex);
    // Check before the signed check: no node is consulted to catch a wrong-chain transaction.
    assertChainId(parsed, network);
    if (parsed.signed) {
      throw new ChainError(
        "invalid_transaction",
        "this transaction is already signed; an EVM transaction takes exactly one signature",
      );
    }
    const outcome = await this.pipeline.signOnly({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      tx: parsed.transaction,
      origin: "imported",
    });
    return { kind: "sign" as const, ...outcomeData(outcome) } as {
      kind: "sign";
      signed: EvmSignedTx;
    } & Record<string, unknown>;
  }

  // Use the locally derived hash so the node cannot redirect confirmation polling.
  async broadcast(
    scope: TransactionScope,
    network: NetworkDescriptor,
    hex: string,
    dryRun = false,
  ) {
    const gateway = this.gateways.get(network, "evm");
    const parsed = gateway.decodeRawTransaction(hex);
    if (!parsed.signed) {
      throw new ChainError("invalid_transaction", "this transaction carries no signature");
    }
    if (dryRun) return this.#dryRunBroadcast(scope, network, gateway, parsed);
    assertChainId(parsed, network);
    const local = parsed.hash;
    const serialized = parsed.serialized!;
    const result = await submitWithTxId(local, () => gateway.sendRawTransaction(serialized));
    const txId = authoritativeTxId(local, result.hash, (m) => scope.warn(m));
    const submitted = {
      stage: "submitted" as const,
      ...result,
      txId,
      ...(result.alreadyKnown ? { alreadyKnown: true } : {}),
    };
    if (!scope.wait) return submitted;
    const confirmed = await evmConfirmation(gateway, scope)(txId).catch(() => undefined);
    if (!confirmed) {
      scope.warn(
        `--wait: ${txId} not confirmed within ${scope.waitTimeoutMs}ms; returning submitted`,
      );
      return submitted;
    }
    return {
      ...submitted,
      stage: confirmed.failed ? ("failed" as const) : ("confirmed" as const),
      ...confirmed,
    };
  }

  // Check chain, nonce and balance without submitting; failed node reads leave checks skipped.
  async #dryRunBroadcast(
    scope: TransactionScope,
    network: NetworkDescriptor,
    gateway: EvmGateway,
    parsed: EvmRawTransaction,
  ) {
    const checks: Array<{ name: string; status: "ok" | "warning" | "skipped"; detail: string }> = [
      {
        name: "signature",
        status: "ok",
        detail: `recovers to ${parsed.from ?? "an unknown signer"}`,
      },
    ];

    assertChainId(parsed, network);
    checks.push({ name: "chainId", status: "ok", detail: `matches ${network.id}` });

    const from = parsed.from;
    const perGasCeiling = BigInt(parsed.maxFeePerGasWei ?? parsed.gasPriceWei ?? "0");
    const maxCostWei = BigInt(parsed.gasLimit) * perGasCeiling;
    const fee = {
      feeModel: parsed.maxFeePerGasWei === undefined ? "legacy" : "eip1559",
      maxCostWei: maxCostWei.toString(),
      gasLimit: parsed.gasLimit,
      maxPerGasWei: perGasCeiling.toString(),
    };

    const state =
      from === undefined
        ? undefined
        : await Promise.all([
            gateway.getTransactionCount(from, "latest"),
            gateway.getTransactionCount(from, "pending"),
            gateway.getNativeBalance(from),
          ]).catch((e: unknown) => {
            scope.warn(
              `--dry-run: the node could not be reached, so nonce and balance were not checked (${(e as Error).message})`,
            );
            return undefined;
          });

    if (state === undefined) {
      checks.push({ name: "nonce", status: "skipped", detail: "the node was not reachable" });
      checks.push({ name: "balance", status: "skipped", detail: "the node was not reachable" });
    } else {
      const [latest, pending, balance] = state;
      if (parsed.nonce < Number(latest)) {
        throw new ChainError(
          "nonce_too_low",
          `nonce ${parsed.nonce} is already used; the account is at ${latest}`,
        );
      }
      if (parsed.nonce > Number(pending)) {
        checks.push({
          name: "nonce",
          status: "warning",
          detail: `${parsed.nonce} is ahead of the account's next nonce ${pending}; it stays queued until the gap is filled`,
        });
        scope.warn(
          `--dry-run: nonce ${parsed.nonce} leaves a gap after ${pending}; this transaction cannot be mined until the missing one is broadcast`,
        );
      } else {
        checks.push({
          name: "nonce",
          status: "ok",
          detail: `${parsed.nonce} is the next to be mined`,
        });
      }

      const required = BigInt(parsed.valueWei) + maxCostWei;
      if (BigInt(balance) < required) {
        throw new ChainError(
          "insufficient_balance",
          `the account holds ${balance} wei but this transaction needs ${required} wei (value ${parsed.valueWei} + fee ceiling ${maxCostWei})`,
        );
      }
      checks.push({
        name: "balance",
        status: "ok",
        detail: `${balance} wei covers the ${required} wei this transaction can cost`,
      });
    }

    const txId = parsed.hash;
    return {
      kind: "broadcast" as const,
      mode: "dry-run" as const,
      ...(txId === undefined ? {} : { txId, hash: txId }),
      ...(from === undefined ? {} : { address: from }),
      ...(parsed.to === undefined ? {} : { to: parsed.to }),
      rawAmount: parsed.valueWei,
      fee,
      tx: parsed.transaction,
      checks,
    };
  }

  // A null receipt can mean pending or absent; read the transaction too.
  async status(
    scope: TransactionScope,
    network: NetworkDescriptor,
    hash: string,
  ): Promise<TxStatusView> {
    const gateway = this.gateways.get(network, "evm");
    const [transaction, receipt, head] = await Promise.all([
      gateway.getTransactionByHash(hash),
      gateway.getTransactionReceipt(hash),
      // Head height only enriches the result; failure must not hide transaction status.
      gateway.getBlockNumber().catch(() => undefined),
    ]);
    const confirmed = receipt !== null;
    const failed = confirmed && receipt.success !== true;
    const state = confirmed
      ? failed
        ? ("failed" as const)
        : ("confirmed" as const)
      : transaction
        ? ("pending" as const)
        : ("not_found" as const);
    if (state === "not_found") {
      scope.warn(
        `${hash} is unknown to this endpoint. Public nodes often prune history, so this may mean ` +
          "the node has no record of it rather than that it never existed; try an archival endpoint.",
      );
    }
    return {
      txid: hash,
      state,
      confirmed,
      failed,
      ...(receipt?.blockNumber === undefined ? {} : { blockNumber: receipt.blockNumber as number }),
      ...confirmationsOf(head, receipt?.blockNumber),
    };
  }

  // An ERC-20 transfer reports its token recipient and amount; other calldata is uninterpreted.
  async info(
    scope: TransactionScope,
    network: NetworkDescriptor,
    hash: string,
  ): Promise<TxInfoView> {
    const gateway = this.gateways.get(network, "evm");
    const [transaction, receipt, head] = await Promise.all([
      gateway.getTransactionByHash(hash),
      gateway.getTransactionReceipt(hash),
      gateway.getBlockNumber().catch(() => undefined),
    ]);
    if (!transaction) {
      throw new ChainError("not_found", `no transaction with hash ${hash} on ${network.id}`);
    }
    const transfer = transaction.erc20Transfer;
    // Timestamp enrichment is optional; an unreadable block must not hide transaction details.
    const blockTime =
      receipt?.blockNumber === undefined
        ? undefined
        : await gateway
            .getBlock(String(receipt.blockNumber))
            .then((block) => block?.timestamp)
            .catch(() => undefined);
    return {
      txid: hash,
      type: transactionType(transaction),
      from: transaction.from,
      ...(transaction.nonce === undefined ? {} : { nonce: transaction.nonce }),
      ...(transfer && transaction.to !== undefined
        ? await this.#erc20Parties(gateway, transaction.to, transfer)
        : {
            ...(transaction.to === undefined ? {} : { to: transaction.to }),
            rawAmount: transaction.valueWei,
            amount: fromBaseUnits(transaction.valueWei, FAMILIES.evm.nativeDecimals),
            symbol: network.nativeSymbol,
          }),
      ...(blockTime === undefined ? {} : { blockTime }),
      ...(receipt === null
        ? {}
        : {
            status: receipt.success === true ? "success" : "revert",
            ...(receipt.blockNumber === undefined
              ? {}
              : { blockNumber: receipt.blockNumber as number }),
            ...(receipt.gasUsed === undefined ? {} : { gasUsed: String(receipt.gasUsed) }),
            ...(receipt.feeWei === undefined ? {} : { feeWei: String(receipt.feeWei) }),
            ...(receipt.effectiveGasPriceWei === undefined
              ? {}
              : { effectiveGasPriceWei: String(receipt.effectiveGasPriceWei) }),
            ...confirmationsOf(head, receipt.blockNumber),
          }),
      transaction: transaction.raw,
      receipt,
    };
  }
}

// Enforce the selected chain even when both networks are EVM.
function assertChainId(tx: EvmRawTransaction, network: NetworkDescriptor): void {
  assertEvmTransactionChain(tx.chainId === "0" ? undefined : tx.chainId, network);
}

function transactionType(transaction: EvmTxView): string {
  if (transaction.to === undefined) return "contract-creation";
  if (transaction.erc20Transfer !== undefined) return "transfer";
  return transaction.input === "0x" ? "transfer" : "contract-call";
}
