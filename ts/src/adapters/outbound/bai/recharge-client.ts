import { baiApiError, baiBusinessMessage } from "./api-error.js";
import { boundedResponse, MAX_HTTP_RESPONSE_BYTES } from "../http/http-response.js";
import { z } from "zod";
import type { Config } from "../../../domain/types/index.js";
import { TransportError, UsageError } from "../../../domain/errors/index.js";
import type {
  BaiRechargeApi,
  BaiBindWalletInput,
  BaiWalletBindingInput,
  BaiCreateOrderInput,
  BaiReportTransactionInput,
  BaiReportResult,
} from "../../../application/ports/bai-recharge.js";
import { DEFAULT_BAI_BASE_URL } from "./client.js";

const text = z.string().trim().min(1);
const wallet = z.object({ address: text, chain: text });
const target = z.object({
  input: z.object({ type: z.literal("personal"), identifier: text }),
  confirmedTarget: z.object({ type: z.literal("personal"), targetId: text }),
});
const amount = z.number().positive().finite().max(Number.MAX_SAFE_INTEGER);
const bindInput = wallet.extend({
  // Preserve the exact bytes signed by the wallet, including surrounding whitespace.
  message: z.string().refine((value) => value.trim().length > 0),
  signature: text,
  version: z.number().int().positive().optional(),
});
const orderInput = z.object({
  channel: z.literal("crypto"),
  chain: text,
  tokenName: text,
  amount,
  walletAddress: text,
  deviceType: z.literal("web"),
  rechargeTarget: target.optional(),
});
const reportInput = z.object({
  chain: text,
  txHash: text,
  rechargeTarget: target.optional(),
  amount: amount.optional(),
});
const object = z.record(z.string(), z.unknown());
const binding = z.object({ success: z.literal(true), binding: wallet.extend({ userId: text }) });
const report = z.discriminatedUnion("success", [
  z.object({ success: z.literal(true), order: object }),
  z.object({ success: z.literal(false), code: z.string().regex(/^[A-Z][A-Z0-9_]{0,80}$/) }),
]);

/** Documented non-batch tRPC recharge endpoints. Never signs, transfers, or retries mutations. */
export class BaiRechargeClient implements BaiRechargeApi {
  constructor(
    private readonly config: Pick<Config, "baiApiKey">,
    private readonly timeoutMs: number,
    private readonly fetcher: typeof fetch = globalThis.fetch,
    private readonly baseUrl = DEFAULT_BAI_BASE_URL,
  ) {}

  async resolveTarget(identifier: string) {
    return this.decode(
      z.object({ type: z.literal("personal"), targetId: text, displayLabel: text }),
      await this.call("order.resolveRechargeTarget", {
        type: "personal",
        identifier: this.input(text, identifier),
      }),
    );
  }
  async isBound(input: BaiWalletBindingInput): Promise<boolean> {
    return this.decode(
      z.boolean(),
      await this.call("wallet.isRechargeBound", this.input(wallet, input), "GET"),
    );
  }
  async bind(input: BaiBindWalletInput) {
    const checked = this.input(bindInput, input);
    const result = this.decode(
      binding,
      await this.call("wallet.bindRechargeWallet", checked),
    ).binding;
    const evm = ["bnb", "base", "eth"].includes(checked.chain);
    const matchingAddress = evm
      ? /^0x[0-9a-fA-F]{40}$/.test(checked.address) &&
        result.address.toLowerCase() === checked.address.toLowerCase()
      : result.address === checked.address;
    const matchingChain = result.chain === checked.chain || (evm && result.chain === "eth");
    if (!matchingAddress)
      throw new TransportError(
        "provider_error",
        "B.AI returned a binding for a different or invalid wallet address",
        {
          procedure: "wallet.bindRechargeWallet",
          reason: "binding_address_mismatch",
          retryPayment: false,
        },
      );
    if (!matchingChain)
      throw new TransportError("provider_error", "B.AI returned a binding for a different chain", {
        procedure: "wallet.bindRechargeWallet",
        reason: "binding_chain_mismatch",
        retryPayment: false,
      });
    return result;
  }
  async createOrder(input: BaiCreateOrderInput): Promise<Record<string, unknown>> {
    const result = this.decode(
      object,
      await this.call("order.createOrder", this.input(orderInput, input)),
    );
    if (result.success === false || Object.keys(result).length === 0) throw this.invalid();
    return result;
  }
  async reportTxHash(input: BaiReportTransactionInput): Promise<BaiReportResult> {
    const result = this.decode(
      report,
      await this.call("order.reportTxHash", this.input(reportInput, input)),
    );
    return result.success
      ? result
      : {
          ...result,
          message:
            baiBusinessMessage(result.code) ??
            "B.AI has not confirmed credit; retain the hash and reconcile before retrying reporting. Do not pay again",
        };
  }
  private input<T>(schema: z.ZodType<T>, value: unknown): T {
    const result = schema.safeParse(value);
    if (!result.success)
      throw new UsageError("invalid_value", "Invalid B.AI request parameters", {
        fields: [...new Set(result.error.issues.map((issue) => issue.path.join(".")))],
      });
    return result.data;
  }
  private invalid() {
    return new TransportError("provider_error", "B.AI recharge API returned an invalid response");
  }
  private decode<T>(schema: z.ZodType<T>, value: unknown): T {
    const result = schema.safeParse(value);
    if (!result.success) throw this.invalid();
    return result.data;
  }
  private async call(
    procedure: string,
    input: unknown,
    method: "GET" | "POST" = "POST",
  ): Promise<unknown> {
    const key = this.config.baiApiKey;
    if (!key)
      throw new UsageError(
        "bai_credentials_missing",
        "B.AI credential is required for recharge account operations",
      );
    const url = new URL(`/trpc/lambda/${procedure}`, this.baseUrl);
    if (url.protocol !== "https:" || url.username || url.password)
      throw new UsageError(
        "invalid_value",
        "B.AI recharge API requires an HTTPS origin without URL credentials",
      );
    const payload = JSON.stringify({ json: input });
    if (method === "GET") url.searchParams.set("input", payload);
    const signal = AbortSignal.timeout(this.timeoutMs);
    let response: Response;
    let decoded: unknown;
    try {
      response = await this.fetcher(url.toString(), {
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        redirect: "error",
        signal,
        ...(method === "POST" ? { body: payload } : {}),
      });
      if ([401, 403, 429].includes(response.status)) {
        await response.body?.cancel();
        throw baiApiError(undefined, procedure, response.status)!;
      }
      response = await boundedResponse(response, MAX_HTTP_RESPONSE_BYTES, signal);
      try {
        decoded = await response.json();
      } catch {
        const statusError = baiApiError(undefined, procedure, response.status);
        if (statusError) throw statusError;
        throw new TransportError("provider_error", "B.AI returned malformed JSON", {
          procedure,
          reason: "malformed_json",
          retryPayment: false,
        });
      }
      const apiError = baiApiError(decoded, procedure, response.status);
      // A report rejection is a credit result, not a reason to pay again.
      const envelope = object.safeParse(decoded);
      const data = envelope.success ? envelope.data : undefined;
      const wrapped = data?.result as { data?: { json?: unknown } } | undefined;
      const reported = report.safeParse(wrapped?.data?.json ?? data);
      if (
        apiError &&
        !(
          response.ok &&
          procedure === "order.reportTxHash" &&
          reported.success &&
          !reported.data.success
        )
      )
        throw apiError;
    } catch (error) {
      if (error instanceof TransportError) throw error;
      if (error instanceof Error && /TimeoutError|AbortError/.test(error.name))
        throw new TransportError(
          "timeout",
          "B.AI recharge API timed out; mutation outcome may be unknown",
        );
      throw new TransportError(
        "provider_error",
        "B.AI recharge API connection failed; check connectivity and reconcile any pending mutation before retrying",
        { procedure, reason: "connection_failed", retryPayment: false },
      );
    }
    const envelope = this.decode(object, decoded);
    if (envelope.error !== undefined) throw this.invalid();
    if (envelope.result !== undefined) {
      const result = this.decode(object, envelope.result);
      const data = this.decode(object, result.data);
      if (!("json" in data)) throw this.invalid();
      return data.json;
    }
    return envelope;
  }
}
