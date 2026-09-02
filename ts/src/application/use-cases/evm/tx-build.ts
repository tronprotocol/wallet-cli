import type { NetworkDescriptor, UnsignedTx } from "../../../domain/types/index.js";
import { planEvmFee } from "../../../domain/fees/evm-gas.js";
import { ChainError, UsageError } from "../../../domain/errors/index.js";
import { decimalToSafeNumber } from "../../../domain/numbers/index.js";
import { resolveGasLimit } from "../../services/evm-gas-estimate.js";
import type { EvmGateway } from "../../ports/chain/gateway-provider.js";

export interface EvmGasInput {
  gasLimit?: string;
  maxFee?: string;
  priorityFee?: string;
  nonce?: number;
}

export interface EvmBuildRequest {
  gateway: EvmGateway;
  network: NetworkDescriptor;
  from: string;
  call: Record<string, unknown>;
  input: EvmGasInput;
  /** `--dry-run` — the caller asked "would this go through?", so the nonce is checked against
   *  the chain rather than merely used. See the `latest` read below. */
  dryRun?: boolean;
  onNonce?: (from: string, nonce: string) => void;
}

export interface EvmBuildResult {
  tx: UnsignedTx;
  fee: Record<string, unknown>;
  warnings?: string[];
}

function overridesOf(input: EvmGasInput) {
  return {
    ...(input.gasLimit === undefined ? {} : { gasLimit: input.gasLimit }),
    ...(input.maxFee === undefined ? {} : { maxFeeWei: input.maxFee }),
    ...(input.priorityFee === undefined ? {} : { priorityFeeWei: input.priorityFee }),
  };
}

function invalidInteger(message: string) {
  return new UsageError("invalid_value", message);
}

export async function buildEvmUnsignedTx(request: EvmBuildRequest): Promise<EvmBuildResult> {
  const { gateway, network, from, call, input, dryRun } = request;
  // With --nonce given, the pending-nonce read exists only to warn about a gap below — it must
  // not be able to fail a build that already has everything it needs, so it is best-effort.
  // Without --nonce, that same read IS the nonce, so it stays a hard dependency (contrast
  // `getBlockNumber` in transaction-service.ts, which is best-effort because it only adds a
  // field to a status view that already has an answer without it).
  const [pendingNonce, fee, latestNonce] = await Promise.all([
    // "pending", not "latest": a latest-based nonce refuses to queue behind a transaction of
    // our own that has not been mined yet.
    input.nonce === undefined
      ? gateway.getTransactionCount(from, "pending")
      : gateway.getTransactionCount(from, "pending").catch(() => undefined),
    gateway.feeData(),
    // The MINED count, read only to answer `--dry-run` — and only when a nonce was given, since
    // a derived one IS the pending count and cannot be behind. Every other mode pays no extra
    // round trip. Best-effort like the read above: a dry run that could not reach the node still
    // builds, rather than failing on a check it could not perform.
    //
    // "latest", not "pending": a nonce below PENDING may be a deliberate replacement of a
    // transaction still in the mempool, which is legitimate. Only one already mined is spent.
    dryRun === true && input.nonce !== undefined
      ? gateway.getTransactionCount(from, "latest").catch(() => undefined)
      : undefined,
  ]);
  const nonce = input.nonce === undefined ? (pendingNonce as string) : String(input.nonce);
  // Before onNonce and before the gas estimate: a doomed transaction should not hand the caller a
  // predicted contract address, nor spend an eth_estimateGas whose failure would report the wrong
  // reason. Same code and wording `tx broadcast --dry-run` answers with.
  if (latestNonce !== undefined && BigInt(nonce) < BigInt(latestNonce)) {
    throw new ChainError(
      "nonce_too_low",
      `nonce ${nonce} is already used; the account is at ${latestNonce}`,
    );
  }
  request.onNonce?.(from, nonce);

  const gasEstimate = await resolveGasLimit(gateway, { from, ...call }, input.gasLimit);

  const plan = planEvmFee({
    ...fee,
    gasLimit: gasEstimate,
    declaredFeeModel: network.feeModel,
    overrides: overridesOf(input),
  });
  const warnings = [...(plan.warnings ?? [])];
  if (
    input.nonce !== undefined &&
    pendingNonce !== undefined &&
    BigInt(nonce) > BigInt(pendingNonce)
  ) {
    warnings.push(
      `explicit nonce ${nonce} is above pending nonce ${pendingNonce}, leaving a nonce gap`,
    );
  }

  return {
    tx: {
      ...call,
      chainId: decimalToSafeNumber(network.chainId, "chainId", invalidInteger),
      nonce: decimalToSafeNumber(nonce, "nonce", invalidInteger),
      gasLimit: plan.gasLimit,
      ...(plan.mode === "eip1559"
        ? { type: 2, maxFeePerGas: plan.maxFeeWei, maxPriorityFeePerGas: plan.priorityFeeWei }
        : { type: 0, gasPrice: plan.gasPriceWei }),
    },
    fee: {
      feeModel: plan.mode,
      maxCostWei: plan.maxCostWei,
      gasLimit: plan.gasLimit,
      maxPerGasWei: plan.maxFeeWei ?? plan.gasPriceWei,
    },
    ...(warnings.length === 0 ? {} : { warnings }),
  };
}
