import { TransportError } from "../../domain/errors/index.js";
/** Extract the recharge MCP result without confusing HTTP success with payment or credit success. */
export function baiPaymentResult(payment: Record<string, unknown>, network: string) {
  let body: unknown = payment.response;
  if (typeof body === "string") {
    try {
      if (body.trim().startsWith("{")) body = JSON.parse(body);
      else {
        const messages = body
          .split(/\r?\n\r?\n/)
          .map((block) =>
            block
              .split(/\r?\n/)
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n"),
          )
          .filter(Boolean);
        body = messages.map((message) => JSON.parse(message)).find((message) => message.id === 1);
      }
    } catch {
      throw invalid();
    }
  }
  const envelope = record(body);
  if (envelope.error) throw invalid();
  let result = record(envelope.result);
  if (result.isError === true) throw invalid();
  if (result.structuredContent) result = record(result.structuredContent);
  const txHash = result.transaction_hash;
  const validHash = network.startsWith("tron:") ? /^[0-9a-fA-F]{64}$/ : /^0x[0-9a-fA-F]{64}$/;
  if (
    typeof txHash !== "string" ||
    !validHash.test(txHash) ||
    (result.network === "tron:0x2b6653dc" ? "tron:728126428" : result.network) !== network
  )
    throw invalid();
  const payer = record(payment.payer).address;
  if (typeof payer !== "string" || !payer) throw invalid();
  return { txHash, payer };
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
function invalid() {
  return new TransportError(
    "invalid_x402_response",
    "Recharge response does not identify a verifiable payment; reconcile before paying again",
  );
}
