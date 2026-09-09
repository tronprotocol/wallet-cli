import { TransportError } from "../../domain/errors/index.js";

/** Only a successful x402 settlement can be reported to B.AI as a payment. */
export function baiPaymentResult(payment: Record<string, unknown>, network: string) {
  const settlement = record(payment.paymentResponse);
  const payer = record(payment.payer)?.address;
  const txHash = settlement?.transaction;
  const expectedNetwork = network === "tron:728126428" ? "tron:0x2b6653dc" : network;
  const validHash = network.startsWith("tron:") ? /^[0-9a-fA-F]{64}$/ : /^0x[0-9a-fA-F]{64}$/;
  const invalid = (reason: string) =>
    invalidSettlement(reason, txHash, settlement?.network, expectedNetwork);
  if (!settlement) throw invalid("missing_settlement");
  if (payment.settled !== true || settlement.success !== true)
    throw invalid("settlement_unconfirmed");
  if (settlement.network !== expectedNetwork) throw invalid("network_mismatch");
  if (typeof txHash !== "string" || !validHash.test(txHash))
    throw invalid("invalid_transaction_hash");
  if (typeof payer !== "string" || !payer) throw invalid("missing_payer");
  if (
    settlement.payer !== undefined &&
    (typeof settlement.payer !== "string" ||
      (network.startsWith("eip155:")
        ? settlement.payer.toLowerCase() !== payer.toLowerCase()
        : settlement.payer !== payer))
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
  // Retain only bounded, syntactically valid evidence; it is NOT a confirmed payment.
  const candidateTxHash =
    typeof txHash === "string" && /^(?:0x)?[0-9a-fA-F]{64}$/.test(txHash) ? txHash : undefined;
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
