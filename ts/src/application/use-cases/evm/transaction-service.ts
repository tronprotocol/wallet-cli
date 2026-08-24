import type {
  AccountRef,
  NetworkDescriptor,
  TxInfoView,
  TxStatusView,
  UnsignedTx,
} from "../../../domain/types/index.js";
import { Transaction } from "ethers";
import { ChainError, ExecutionError, UsageError } from "../../../domain/errors/index.js";
import { authoritativeTxId } from "../../services/broadcast-identity.js";
import { FAMILIES } from "../../../domain/family/index.js";
import { evmChecksumAddress } from "../../../domain/address/index.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { fromBaseUnits, toBaseUnits } from "../../../domain/amounts/index.js";
import { planEvmFee } from "../../../domain/fees/evm-gas.js";
import { evmConfirmation } from "../../services/evm-confirmation.js";
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
    const transfer = this.resolveTransfer(network.id, scope.activeAccount, input);

    // The plan is produced while building and read back by the estimate hook. It is held here
    // rather than attached to the transaction: --dry-run and --build-only echo that object
    // verbatim, and a fee plan riding along inside it reads as part of the transaction.
    let plan: Record<string, unknown> = {};
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
          gateway,
          network,
          from,
          recipient.address,
          transfer,
          input,
        );
        plan = fee;
        return tx;
      },
      // The plan already carries the ceiling, so there is nothing further to ask the node.
      estimate: async () => plan,
    });

    return {
      kind: "send" as const,
      ...outcomeData(outcome),
      rawAmount: transfer.rawAmount,
      token: transfer.symbol,
      decimals: transfer.decimals,
      contract: transfer.contract,
      to: recipient.address,
      ...(recipient.contactName ? { toContact: recipient.contactName } : {}),
    };
  }

  /**
   * Scale the amount. A token is scaled by ITS OWN decimals, never the chain's: 5 USDT is
   * 5_000_000 at six decimals, and using the native eighteen would overpay by a factor of a
   * trillion. `--raw-amount` is already in base units and is passed through untouched.
   */
  private resolveTransfer(networkId: string, account: AccountRef, input: EvmSendInput) {
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
      return { contract, decimals, symbol, rawAmount: toBaseUnits(input.amount!, native, "amount") };
    }
    if (decimals === undefined) {
      throw new ExecutionError(
        "token_metadata_unavailable",
        `could not establish decimals for ${contract}; add it with \`token add\` first`,
      );
    }
    return {
      contract,
      decimals,
      symbol,
      rawAmount: toBaseUnits(input.amount!, decimals, "token"),
    };
  }

  /** the party fields for a decoded ERC-20 transfer, in the same shape the TRON side reports for
   *  TRC20: the token contract, its symbol, and a human amount scaled by its decimals. Metadata
   *  is best-effort — an unreadable contract degrades to the base-unit amount rather than losing
   *  the transfer. */
  async #erc20Parties(
    gateway: EvmGateway,
    contract: string,
    transfer: { to: string; rawAmount: string },
  ) {
    const meta = await gateway.getErc20Metadata(contract).catch(() => ({}) as { symbol?: string; decimals?: number });
    return {
      to: transfer.to,
      contract,
      ...(meta.symbol === undefined ? {} : { symbol: meta.symbol }),
      amount:
        meta.decimals === undefined
          ? transfer.rawAmount
          : fromBaseUnits(transfer.rawAmount, meta.decimals),
    };
  }

  async #build(
    gateway: EvmGateway,
    network: NetworkDescriptor,
    from: string,
    to: string,
    transfer: { contract?: string; rawAmount: string },
    input: EvmSendInput,
  ): Promise<{ tx: UnsignedTx; fee: Record<string, unknown> }> {
    // An ERC-20 transfer moves no native coin: the recipient and amount live in the calldata,
    // and the transaction is addressed to the contract.
    const call = transfer.contract
      ? { to: transfer.contract, value: "0", data: gateway.encodeErc20Transfer(to, transfer.rawAmount) }
      : { to, value: transfer.rawAmount };

    const [nonce, fee] = await Promise.all([
      // "pending", not "latest": a latest-based nonce refuses to queue behind a transaction of
      // our own that has not been mined yet.
      input.nonce === undefined
        ? gateway.getTransactionCount(from, "pending")
        : Promise.resolve(String(input.nonce)),
      gateway.feeData(),
    ]);
    const gasEstimate =
      input.gasLimit ??
      (await gateway.estimateGas({ from, ...call }).catch(() => undefined)) ??
      "21000";

    const plan = planEvmFee({
      ...fee,
      gasLimit: gasEstimate,
      declaredFeeModel: network.feeModel,
      overrides: {
        ...(input.gasLimit === undefined ? {} : { gasLimit: input.gasLimit }),
        ...(input.maxFee === undefined ? {} : { maxFeeWei: input.maxFee }),
        ...(input.priorityFee === undefined ? {} : { priorityFeeWei: input.priorityFee }),
      },
    });

    return {
      tx: {
        ...call,
        chainId: Number(network.chainId),
        nonce: Number(nonce),
        gasLimit: plan.gasLimit,
        ...(plan.mode === "eip1559"
          ? { type: 2, maxFeePerGas: plan.maxFeeWei, maxPriorityFeePerGas: plan.priorityFeeWei }
          : { type: 0, gasPrice: plan.gasPriceWei }),
      },
      fee: { feeModel: plan.mode, maxCostWei: plan.maxCostWei, gasLimit: plan.gasLimit },
    };
  }

  /**
   * Sign a transaction built elsewhere. An EVM transaction carries exactly one signature — there
   * is no multi-signature accumulation to relay — so the input is an UNSIGNED serialisation and
   * the output is the signed one. A transaction that already carries a signature is refused
   * rather than re-signed: the result would be a different transaction wearing the same intent.
   */
  async sign(scope: TransactionScope, network: NetworkDescriptor, hex: string) {
    const parsed = parseEvmTransaction(hex);
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
    return { kind: "sign" as const, ...outcomeData(outcome) };
  }

  /**
   * Broadcast a signed transaction supplied as raw hex.
   *
   * The reported id is derived from the bytes, never taken from the node: the hash of a signed
   * transaction is a property of the transaction, and `authoritativeTxId` exists so a node cannot
   * name a different one for us to poll and quote back.
   */
  async broadcast(scope: TransactionScope, network: NetworkDescriptor, hex: string) {
    const parsed = parseEvmTransaction(hex);
    if (parsed.signature === null) {
      throw new ChainError("invalid_transaction", "this transaction carries no signature");
    }
    const gateway = this.gateways.get(network, "evm");
    const result = await gateway.sendRawTransaction(parsed.serialized);
    const txId = authoritativeTxId(parsed.hash ?? undefined, result.hash, (m) => scope.warn(m));
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
    return { ...submitted, stage: confirmed.failed ? ("failed" as const) : ("confirmed" as const), ...confirmed };
  }

  /**
   * Confirmation state, in four kinds.
   *
   * A receipt alone cannot separate "in the mempool" from "never existed" — the RPC answers null
   * to both — so the transaction object is read alongside it, mirroring how the TRON side pairs
   * getTransactionById with getTransactionInfoById.
   *
   * `not_found` carries a warning because it is the one answer that can be wrong about the past:
   * a pruned or non-archival endpoint reports null for a transaction that really did happen, and
   * a bare "not found" invites the reader to conclude it never did.
   */
  async status(
    scope: TransactionScope,
    network: NetworkDescriptor,
    hash: string,
  ): Promise<TxStatusView> {
    const gateway = this.gateways.get(network, "evm");
    const [transaction, receipt] = await Promise.all([
      gateway.getTransactionByHash(hash).catch(() => null),
      gateway.getTransactionReceipt(hash).catch(() => null),
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
      ...(receipt?.blockNumber === undefined
        ? {}
        : { blockNumber: receipt.blockNumber as number }),
    };
  }

  /**
   * Full detail. `to` and the amount are read from the transaction, except for an ERC-20
   * `transfer`, whose real recipient and amount live in the calldata — reporting the raw fields
   * there would name the CONTRACT as the recipient and the amount as zero, which is what the TRON
   * side already avoids for TRC20.
   *
   * Only that one selector is decoded. Anything else is left as the chain recorded it: guessing
   * at unknown calldata would be inventing meaning the signature does not carry.
   */
  async info(
    scope: TransactionScope,
    network: NetworkDescriptor,
    hash: string,
  ): Promise<TxInfoView> {
    const gateway = this.gateways.get(network, "evm");
    const [transaction, receipt] = await Promise.all([
      gateway.getTransactionByHash(hash),
      gateway.getTransactionReceipt(hash).catch(() => null),
    ]);
    if (!transaction) {
      throw new UsageError("not_found", `no transaction with hash ${hash} on ${network.id}`);
    }
    const transfer = decodeErc20Transfer(String(transaction.input ?? "0x"));
    const value = BigInt(String(transaction.value ?? "0x0"));
    return {
      txid: hash,
      from: checksummed(transaction.from),
      ...(transfer
        ? await this.#erc20Parties(gateway, checksummed(transaction.to), transfer)
        : {
            to: checksummed(transaction.to),
            amount: fromBaseUnits(value.toString(10), FAMILIES.evm.nativeDecimals),
            symbol: network.nativeSymbol,
          }),
      ...(receipt === null
        ? {}
        : {
            status: receipt.success === true ? "SUCCESS" : "REVERT",
            ...(receipt.blockNumber === undefined
              ? {}
              : { blockNumber: receipt.blockNumber as number }),
            ...(receipt.gasUsed === undefined ? {} : { gasUsed: Number(receipt.gasUsed) }),
            ...(receipt.feeWei === undefined ? {} : { feeWei: String(receipt.feeWei) }),
          }),
      transaction,
      receipt,
    };
  }
}

/** parse raw hex into an ethers Transaction, reporting bad input as bad input. */
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

/** ERC-20 `transfer(address,uint256)` calldata → its recipient and base-unit amount. */
function decodeErc20Transfer(input: string): { to: string; rawAmount: string } | undefined {
  // 0xa9059cbb is the transfer(address,uint256) selector; 4 bytes + two 32-byte words.
  if (!/^0xa9059cbb[0-9a-fA-F]{128}$/.test(input)) return undefined;
  const body = input.slice(10);
  return {
    // Calldata carries the address in lower case with no checksum. Every other address this CLI
    // prints is EIP-55, so it is re-checksummed here rather than shown in a second style.
    to: evmChecksumAddress(hexToBytes(body.slice(24, 64))),
    rawAmount: BigInt(`0x${body.slice(64, 128)}`).toString(10),
  };
}

/**
 * An address in EIP-55 form. Nodes answer in lower case, but every address this CLI prints comes
 * out checksummed, and one payload mixing both styles invites a reader comparing an address
 * against their own to conclude they do not match. Anything that is not a 20-byte hex address
 * (a contract creation's null `to`, say) is passed through untouched.
 */
function checksummed(value: unknown): string {
  const text = String(value ?? "");
  if (!/^0x[0-9a-fA-F]{40}$/.test(text)) return text;
  return evmChecksumAddress(hexToBytes(text.slice(2)));
}
