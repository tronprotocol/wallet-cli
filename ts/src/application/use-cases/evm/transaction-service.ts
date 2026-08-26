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

    // The plan is produced while building and read back by the estimate hook. It is held here
    // rather than attached to the transaction: --dry-run and --build-only echo that object
    // verbatim, and a fee plan riding along inside it reads as part of the transaction.
    let plan: Record<string, unknown> = {};
    // The nonce is decided while building and never appears in a receipt we might not get. It is
    // the field §4.3 calls the entry point for diagnosing a stuck transaction, so the receipt
    // states it even when the transaction is only submitted.
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
      // The plan already carries the ceiling, so there is nothing further to ask the node.
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

  /**
   * Scale the amount. A token is scaled by ITS OWN decimals, never the chain's: 5 USDT is
   * 5_000_000 at six decimals, and using the native eighteen would overpay by a factor of a
   * trillion. `--raw-amount` is already in base units and is passed through untouched.
   */
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
      // `--contract` names a token that need not be in the address book, so the contract itself
      // is asked — the same fallback the TRON side makes for a bare --contract. Scaling by a
      // guessed decimals would move the wrong amount by orders of magnitude, so an unreadable
      // contract is an error, never a default.
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

  /** the party fields for a decoded ERC-20 transfer, in the same shape the TRON side reports for
   *  TRC20: the token contract, its symbol, and a human amount scaled by its decimals. Metadata
   *  is best-effort — an unreadable contract degrades to the base-unit amount rather than losing
   *  the transfer. */
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
      // Both forms, as everywhere else: the exact integer for arithmetic, the scaled one to read.
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
    // An ERC-20 transfer moves no native coin: the recipient and amount live in the calldata,
    // and the transaction is addressed to the contract.
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
    });
    for (const warning of built.warnings ?? []) scope.warn(warning);
    return built;
  }

  /**
   * Sign a transaction built elsewhere. An EVM transaction carries exactly one signature — there
   * is no multi-signature accumulation to relay — so the input is an UNSIGNED serialisation and
   * the output is the signed one. A transaction that already carries a signature is refused
   * rather than re-signed: the result would be a different transaction wearing the same intent.
   */
  async sign(scope: TransactionScope, network: NetworkDescriptor, hex: string) {
    const parsed = parseEvmTransaction(hex);
    // BEFORE the signature: a transaction states the chain it is for, and signing keeps that
    // value. Nothing downstream can catch this — no node is consulted when signing — so a
    // mainnet transaction handed to `--network sepolia` would come back validly signed FOR
    // MAINNET, which is the one mistake this command must not make quietly.
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
    return { kind: "sign" as const, ...outcomeData(outcome) };
  }

  /**
   * Broadcast a signed transaction supplied as raw hex.
   *
   * The reported id is derived from the bytes, never taken from the node: the hash of a signed
   * transaction is a property of the transaction, and `authoritativeTxId` exists so a node cannot
   * name a different one for us to poll and quote back.
   */
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
    // The selected network's node would reject a foreign chain id anyway, but refusing here says
    // WHICH chain the transaction was built for, and keeps it out of a mempool it never belonged in.
    assertChainId(parsed, network);
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
    return {
      ...submitted,
      stage: confirmed.failed ? ("failed" as const) : ("confirmed" as const),
      ...confirmed,
    };
  }

  /**
   * `tx broadcast --dry-run` — answer "would this go through?" without submitting it.
   *
   * TRON's dry run resolves the full approval state against the node, so this does the EVM
   * equivalent rather than a bare parse: the three things that actually stop a signed EVM
   * transaction are the wrong chain, a spent nonce and a balance that cannot cover value plus
   * the fee ceiling. A blocker throws, so `--dry-run` exits non-zero on a transaction that would
   * fail — the answer a script is asking for.
   *
   * The node reads are best-effort. An unreachable endpoint downgrades those checks to `skipped`
   * with a warning instead of failing the command: a dry run that cannot reach a node is still
   * worth more than no dry run, and reporting "cannot broadcast" would be a claim about the
   * transaction that this code has not established.
   */
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

    // Local, and the cheapest way to catch a transaction signed for another chain: a replay of it
    // here is impossible, so there is nothing to gain by asking a node first.
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
    const [transaction, receipt, head] = await Promise.all([
      gateway.getTransactionByHash(hash).catch(() => null),
      gateway.getTransactionReceipt(hash).catch(() => null),
      // Best-effort third call: it only adds a field, and must not be able to fail the answer.
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
    const [transaction, receipt, head] = await Promise.all([
      gateway.getTransactionByHash(hash),
      gateway.getTransactionReceipt(hash).catch(() => null),
      gateway.getBlockNumber().catch(() => undefined),
    ]);
    if (!transaction) {
      throw new UsageError("not_found", `no transaction with hash ${hash} on ${network.id}`);
    }
    const transfer = decodeErc20Transfer(String(transaction.input ?? "0x"));
    const value = BigInt(String(transaction.value ?? "0x0"));
    // The block only for its timestamp, and only once we know there is one. Best-effort like the
    // head read: a detail view is still worth having without the wall-clock time.
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
      // The transaction's own nonce, flattened out of the node object: §4.3 makes it the entry
      // point for diagnosing a stuck transaction, and digging it out of a passthrough field is
      // not what "the detail view" should ask of a reader.
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
            // Lower case, per §6.5: `tx status` and every write receipt already answer in lower
            // case, and one field spelled two ways makes an agent match twice for one meaning.
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

/**
 * Refuse a transaction built for a different chain.
 *
 * EIP-155 puts the chain id inside the transaction, so this is answerable locally and BEFORE a
 * signature exists. `family_mismatch` does not fire here — a mainnet transaction and a Sepolia one
 * are both EVM — which is exactly why this check has to be its own: without it, signing a mainnet
 * transaction while pointing at a testnet produces a perfectly valid mainnet transaction and says
 * nothing.
 */
function assertChainId(tx: Transaction, network: NetworkDescriptor): void {
  if (String(tx.chainId) === String(network.chainId)) return;
  throw new ChainError(
    "chain_id_mismatch",
    `this transaction is built for chain ${tx.chainId}, but ${network.id} is chain ${network.chainId}`,
  );
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

/**
 * What KIND of transaction this is, in three words a reader can act on.
 *
 * Deliberately coarse: `transfer` covers a native send and a decoded ERC-20 transfer (both move
 * value to someone), `contract-creation` is a deployment (`to` is null — that IS what makes it
 * one), and everything else is `contract-call`. Naming the METHOD would mean decoding calldata we
 * have chosen not to decode.
 */
function transactionType(transaction: Record<string, unknown>, isErc20Transfer: boolean): string {
  if (transaction.to === null || transaction.to === undefined) return "contract-creation";
  if (isErc20Transfer) return "transfer";
  const input = String(transaction.input ?? "0x");
  return input === "0x" || input === "" ? "transfer" : "contract-call";
}

/** hex QUANTITY (or a decimal) → number; undefined when it is neither. */
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
