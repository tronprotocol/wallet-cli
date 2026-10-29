import { CHAIN_FAMILIES, isTxHash, sameAddress } from "../../domain/family/index.js";
import { TransportError } from "../../domain/errors/index.js";
import { sameX402Network } from "../../domain/x402/network-id.js";
import type { X402ResponseResult } from "../ports/x402-payment.js";

/** Only a successful x402 settlement can be reported to B.AI as a payment. */
export function baiPaymentResult(
  payment: Pick<X402ResponseResult, "settled" | "payer" | "paymentResponse">,
  network: string,
) {
  const settlement = record(payment.paymentResponse);
  const payer = record(payment.payer)?.address;
  const txHash = settlement?.transaction;
  const invalid = (reason: string) =>
    invalidSettlement(reason, txHash, settlement?.network, network);
  if (!settlement) throw invalid("missing_settlement");
  if (payment.settled !== true || settlement.success !== true)
    throw invalid("settlement_unconfirmed");
  if (typeof settlement.network !== "string" || !sameX402Network(settlement.network, network))
    throw invalid("network_mismatch");
  if (typeof txHash !== "string" || !isTxHash(network.startsWith("tron:") ? "tron" : "evm", txHash))
    throw invalid("invalid_transaction_hash");
  if (typeof payer !== "string" || !payer) throw invalid("missing_payer");
  if (
    settlement.payer !== undefined &&
    (typeof settlement.payer !== "string" ||
      !sameAddress(network.startsWith("eip155:") ? "evm" : "tron", settlement.payer, payer))
  ) {
    throw invalid("payer_mismatch");
  }
  return { txHash, payer };
}

function invalidSettlement(
  reason: string,
  txHash: unknown,
  candidateNetwork: unknown,
  expectedNetwork: string,
) {
  // Candidate evidence is bounded and unconfirmed.
  const candidateTxHash =
    typeof txHash === "string" && CHAIN_FAMILIES.some((family) => isTxHash(family, txHash))
      ? txHash
      : undefined;
  return new TransportError(
    "invalid_x402_response",
    "Recharge settlement is unconfirmed; reconcile before paying again",
    {
      reason,
      paymentStatus: "unknown",
      settled: false,
      retryPayment: false,
      expectedNetwork,
      ...(candidateTxHash ? { candidateTxHash } : {}),
      ...(typeof candidateNetwork === "string" &&
      /^(?:eip155:\d{1,20}|tron:(?:0x[0-9a-fA-F]{1,16}|\d{1,20}))$/.test(candidateNetwork)
        ? { candidateNetwork }
        : {}),
    },
  );
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
