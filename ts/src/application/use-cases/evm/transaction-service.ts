import type {
  AccountRef,
  NetworkDescriptor,
  TxInfoView,
  TxStatusView,
  UnsignedTx,
} from "../../../domain/types/index.js";
import { Transaction } from "ethers";
import { ChainError, ExecutionError } from "../../../domain/errors/index.js";
import { authoritativeTxId, submitWithTxId } from "../../services/broadcast-identity.js";
import { FAMILIES } from "../../../domain/family/index.js";
import { evmChecksumAddress } from "../../../domain/address/index.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { fromBaseUnits, toBaseUnits } from "../../../domain/amounts/index.js";
import { evmConfirmation } from "../../services/evm-confirmation.js";
import { confirmationsOf } from "../../services/confirmations.js";
import { buildEvmUnsignedTx } from "./tx-build.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { EvmGateway } from "../../ports/chain/gateway-provider.js";
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

// EVM signed artifact: raw serialized bytes and their hash.
interface EvmSignedTx {
  raw: string;
  hash: string;
}

export interface EvmSendInput extends TransactionModeInput {
  to: string;
  token?: string;
  contract?: string;
  /** the token's decimals, resolved from the address book by the caller. */
  decimals?: number;
  amount?: string;
  rawAmount?: string;
  gasLimit?: string;
  maxFee?: string;
  priorityFee?: string;
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

    // Keep fee metadata outside the transaction echoed by dry-run/build-only.
    let plan: Record<string, unknown> = {};
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
        nonce = (tx as { nonce?: number }).nonce;
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
  ): Promise<{ tx: UnsignedTx; fee: Record<string, unknown> }> {
    // ERC20 recipient and amount belong in calldata; native value must be zero.
    const call = transfer.contract
      ? {
          to: transfer.contract,
          value: "0",
          data: gateway.encodeErc20Transfer(to, transfer.rawAmount),
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
    const parsed = parseEvmTransaction(hex);
    // Check before signing: no node is consulted to catch a wrong-chain transaction.
    assertChainId(parsed, network);
    if (parsed.signature !== null) {
      throw new ChainError(
        "invalid_transaction",
        "this transaction is already signed; an EVM transaction takes exactly one signature",
      );
    }
    const outcome = await this.pipeline.signOnly({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      tx: parsed.toJSON ? JSON.parse(JSON.stringify(parsed.toJSON())) : parsed,
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
    const parsed = parseEvmTransaction(hex);
    if (parsed.signature === null) {
      throw new ChainError("invalid_transaction", "this transaction carries no signature");
    }
    const gateway = this.gateways.get(network, "evm");
    if (dryRun) return this.#dryRunBroadcast(scope, network, gateway, parsed);
    assertChainId(parsed, network);
    const local = parsed.hash ?? undefined;
    const serialized = parsed.serialized;
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
    parsed: Transaction,
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
    const perGasCeiling = parsed.maxFeePerGas ?? parsed.gasPrice ?? 0n;
    const maxCostWei = parsed.gasLimit * perGasCeiling;
    const fee = {
      feeModel: parsed.maxFeePerGas === null ? "legacy" : "eip1559",
      maxCostWei: maxCostWei.toString(),
      gasLimit: parsed.gasLimit.toString(),
      maxPerGasWei: perGasCeiling.toString(),
    };

    const state =
      from === null
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

      const required = parsed.value + maxCostWei;
      if (BigInt(balance) < required) {
        throw new ChainError(
          "insufficient_balance",
          `the account holds ${balance} wei but this transaction needs ${required} wei (value ${parsed.value} + fee ceiling ${maxCostWei})`,
        );
      }
      checks.push({
        name: "balance",
        status: "ok",
        detail: `${balance} wei covers the ${required} wei this transaction can cost`,
      });
    }

    const txId = parsed.hash ?? undefined;
    return {
      kind: "broadcast" as const,
      mode: "dry-run" as const,
      ...(txId === undefined ? {} : { txId, hash: txId }),
      ...(from === null ? {} : { address: from }),
      ...(parsed.to === null ? {} : { to: parsed.to }),
      rawAmount: parsed.value.toString(),
      fee,
      tx: JSON.parse(JSON.stringify(parsed.toJSON())) as UnsignedTx,
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

  // Decode ERC20 transfer parties from calldata; leave other selectors uninterpreted.
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
    const transfer = decodeErc20Transfer(String(transaction.input ?? "0x"));
    const value = BigInt(String(transaction.value ?? "0x0"));
    // Timestamp enrichment is optional; an unreadable block must not hide transaction details.
    const blockTime =
      receipt?.blockNumber === undefined
        ? undefined
        : await gateway
            .getBlock(String(receipt.blockNumber))
            .then((block) => quantityToNumber((block as { timestamp?: unknown } | null)?.timestamp))
            .catch(() => undefined);
    return {
      txid: hash,
      type: transactionType(transaction, transfer !== undefined),
      from: checksummed(transaction.from),
      ...(transaction.nonce === undefined ? {} : { nonce: quantityToNumber(transaction.nonce) }),
      ...(transfer
        ? await this.#erc20Parties(gateway, checksummed(transaction.to), transfer)
        : {
            to: checksummed(transaction.to),
            rawAmount: value.toString(10),
            amount: fromBaseUnits(value.toString(10), FAMILIES.evm.nativeDecimals),
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
      transaction,
      receipt,
    };
  }
}

// Enforce the selected chain even when both networks are EVM.
function assertChainId(tx: Transaction, network: NetworkDescriptor): void {
  if (String(tx.chainId) === String(network.chainId)) return;
  throw new ChainError(
    "chain_id_mismatch",
    `this transaction is built for chain ${tx.chainId}, but ${network.id} is chain ${network.chainId}`,
  );
}

function parseEvmTransaction(hex: string): Transaction {
  try {
    return Transaction.from(hex);
  } catch (e) {
    throw new ChainError(
      "invalid_transaction",
      `not a valid EVM transaction: ${(e as Error).message}`,
    );
  }
}

function transactionType(transaction: Record<string, unknown>, isErc20Transfer: boolean): string {
  if (transaction.to === null || transaction.to === undefined) return "contract-creation";
  if (isErc20Transfer) return "transfer";
  const input = String(transaction.input ?? "0x");
  return input === "0x" || input === "" ? "transfer" : "contract-call";
}

// Parses hex or decimal integers to Number; does not enforce the safe-integer range.
function quantityToNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    return Number(BigInt(String(value)));
  } catch {
    return undefined;
  }
}

/** ERC-20 `transfer(address,uint256)` calldata → its recipient and base-unit amount. */
function decodeErc20Transfer(input: string): { to: string; rawAmount: string } | undefined {
  // Transfer selector followed by two 32-byte ABI words.
  if (!/^0xa9059cbb[0-9a-fA-F]{128}$/.test(input)) return undefined;
  const body = input.slice(10);
  return {
    to: evmChecksumAddress(hexToBytes(body.slice(24, 64))),
    rawAmount: BigInt(`0x${body.slice(64, 128)}`).toString(10),
  };
}

// Checksum 20-byte hex addresses; stringify other values, mapping nullish values to empty text.
function checksummed(value: unknown): string {
  const text = String(value ?? "");
  if (!/^0x[0-9a-fA-F]{40}$/.test(text)) return text;
  return evmChecksumAddress(hexToBytes(text.slice(2)));
}
