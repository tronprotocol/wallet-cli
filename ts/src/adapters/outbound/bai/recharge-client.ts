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
  message: text,
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
        identifier: text.parse(identifier),
      }),
    );
  }
  async isBound(input: BaiWalletBindingInput): Promise<boolean> {
    return this.decode(
      z.boolean(),
      await this.call("wallet.isRechargeBound", wallet.parse(input), "GET"),
    );
  }
  async bind(input: BaiBindWalletInput) {
    const checked = bindInput.parse(input);
    const result = this.decode(
      binding,
      await this.call("wallet.bindRechargeWallet", checked),
    ).binding;
    if (result.address !== checked.address || result.chain !== checked.chain) throw this.invalid();
    return result;
  }
  async createOrder(input: BaiCreateOrderInput): Promise<Record<string, unknown>> {
    const result = this.decode(
      object,
      await this.call("order.createOrder", orderInput.parse(input)),
    );
    if (result.success === false || Object.keys(result).length === 0) throw this.invalid();
    return result;
  }
  async reportTxHash(input: BaiReportTransactionInput): Promise<BaiReportResult> {
    return this.decode(report, await this.call("order.reportTxHash", reportInput.parse(input)));
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
      if (!response.ok) await response.body?.cancel();
      if (response.status === 401 || response.status === 403)
        throw new TransportError("bai_auth_failed", "B.AI API rejected the configured credential");
      if (response.status === 429)
        throw new TransportError("provider_rate_limited", "B.AI API rate limit exceeded");
      if (!response.ok)
        throw new TransportError(
          "provider_error",
          `B.AI recharge API returned HTTP ${response.status}`,
        );
      response = await boundedResponse(response, MAX_HTTP_RESPONSE_BYTES, signal);
      decoded = await response.json();
    } catch (error) {
      if (error instanceof TransportError) throw error;
      if (error instanceof Error && /TimeoutError|AbortError/.test(error.name))
        throw new TransportError(
          "timeout",
          "B.AI recharge API timed out; mutation outcome may be unknown",
        );
      throw new TransportError(
        "provider_error",
        "B.AI recharge API request failed; mutation outcome may be unknown",
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
