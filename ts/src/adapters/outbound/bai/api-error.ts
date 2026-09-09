import { TransportError } from "../../../domain/errors/index.js";

/** Only documented or observed identifiers are exposed; never forward server prose. */
const BUSINESS_ERRORS: Record<string, string> = {
  WalletInvalidSignature:
    "B.AI rejected the binding signature. Rebuild the BAI binding message with the correct origin, address, chain ID, expiration and nonce, then sign it with the selected wallet",
  UNSUPPORTED_CHAIN: "B.AI does not support this recharge chain; select a supported mainnet",
  TX_NOT_FOUND_OR_INVALID:
    "B.AI could not verify the transaction. Check confirmation, chain, recipient and sender; do not pay again",
  UNSUPPORTED_TOKEN: "B.AI does not support this recharge token on the selected chain",
  PAYER_MISMATCH:
    "The transaction sender does not match the wallet bound to this B.AI user; verify the original payer and API key",
  WALLET_NOT_BOUND:
    "The wallet is not bound to this B.AI user; complete wallet binding and confirm the selected account and network",
  RECHARGE_TX_TOO_OLD:
    "The transaction is outside B.AI's recharge reporting window; retain the hash and contact B.AI support instead of paying again",
  TX_TIMESTAMP_UNAVAILABLE:
    "B.AI could not obtain the transaction timestamp; check the transaction and retry reporting later, not payment",
  PRICE_UNAVAILABLE:
    "B.AI could not obtain the token price; retry reporting later without paying again",
  RECHARGE_AMOUNT_TOO_SMALL:
    "The recharge amount is below B.AI's minimum; verify the token and amount and retain any existing transaction hash",
  SELF_RECHARGE_TARGET:
    "The recipient is the current B.AI user; omit the recipient override for self recharge",
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
export function baiBusinessMessage(code: string): string | undefined {
  return Object.hasOwn(BUSINESS_ERRORS, code) ? BUSINESS_ERRORS[code] : undefined;
}

export function baiApiError(
  value: unknown,
  procedure: string,
  status: number,
): TransportError | undefined {
  const root = record(Array.isArray(value) ? value[0] : value);
  const error = record(root?.error);
  const detail = record(error?.json) ?? error;
  const result = record(record(root?.result)?.data);
  const payload = record(result?.json) ?? root;
  const failed = root?.error !== undefined || payload?.success === false || status >= 400;
  if (!failed) return undefined;
  const context = { procedure, httpStatus: status, retryPayment: false };
  if (status === 401 || status === 403)
    return new TransportError(
      "bai_auth_failed",
      "B.AI rejected this API key or its permissions; check the personal API key for this user",
      context,
    );
  if (status === 429)
    return new TransportError(
      "provider_rate_limited",
      "B.AI rate limit exceeded; wait before retrying this API operation",
      context,
    );
  const candidates = [detail?.message, detail?.code, record(detail?.data)?.code, payload?.code];
  for (const candidate of candidates) {
    const reason =
      candidate === "请勿输入当前账号的邮箱或地址" ? "SELF_RECHARGE_TARGET" : candidate;
    if (typeof reason !== "string") continue;
    const message = baiBusinessMessage(reason);
    if (message) return new TransportError("bai_rejected", message, { ...context, reason });
  }
  const rpcCode = record(detail?.data)?.code;
  if (rpcCode === "UNAUTHORIZED" || rpcCode === "FORBIDDEN")
    return new TransportError(
      "bai_auth_failed",
      "B.AI rejected this API key or its permissions; check the personal API key for this user",
      context,
    );
  if (rpcCode === "TOO_MANY_REQUESTS")
    return new TransportError(
      "provider_rate_limited",
      "B.AI rate limit exceeded; wait before retrying this API operation",
      context,
    );
  return new TransportError(
    "provider_error",
    status >= 500
      ? "B.AI service failed; check service availability and reconcile any pending mutation before retrying"
      : "B.AI rejected the API request with an unrecognized error; check the operation parameters and contact B.AI support if it persists",
    context,
  );
}
