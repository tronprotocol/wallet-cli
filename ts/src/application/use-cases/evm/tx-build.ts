import type {
  EvmFeeReport,
  EvmUnsignedTx,
  NetworkDescriptor,
} from "../../../domain/types/index.js";
import { planEvmFee } from "../../../domain/fees/evm-gas.js";
import { ChainError, UsageError } from "../../../domain/errors/index.js";
import { decimalToSafeNumber } from "../../../domain/numbers/index.js";
import { resolveGasLimit } from "../../services/evm-gas-estimate.js";
import type { EvmGateway } from "../../ports/chain/gateway-provider.js";
import type { Wei } from "../../../domain/amounts/index.js";

export interface EvmGasInput {
  gasLimit?: string;
  maxFee?: Wei;
  priorityFee?: Wei;
  nonce?: number;
}

// Absent `to` creates a contract; value is decimal wei.
export interface EvmCall {
  to?: string;
  data?: string;
  value: string;
}

export interface EvmBuildRequest {
  gateway: EvmGateway;
  network: NetworkDescriptor;
  from: string;
  call: EvmCall;
  input: EvmGasInput;
  // Best-effort check of an explicit nonce against the mined count.
  dryRun?: boolean;
  onNonce?: (from: string, nonce: string) => void;
}

export interface EvmBuildResult {
  tx: EvmUnsignedTx;
  fee: EvmFeeReport;
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
  // With an explicit nonce, the pending read only supplies a gap warning and is optional.
  const [pendingNonce, fee, latestNonce] = await Promise.all([
    // Pending count includes unmined transactions so new sends queue behind them.
    input.nonce === undefined
      ? gateway.getTransactionCount(from, "pending")
      : gateway.getTransactionCount(from, "pending").catch(() => undefined),
    gateway.feeData(),
    // Compare with mined count: a nonce below pending can be a valid replacement.
    dryRun === true && input.nonce !== undefined
      ? gateway.getTransactionCount(from, "latest").catch(() => undefined)
      : undefined,
  ]);
  const nonce = input.nonce === undefined ? (pendingNonce as string) : String(input.nonce);
  // Reject spent nonces before predicting a deployment address or estimating gas.
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
