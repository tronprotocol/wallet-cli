import { CommandDeadline } from "../services/command-deadline.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  freshRequestDeadlines,
  Paywall,
  paywallTerms,
  sharedRequestDeadline,
} from "./x402-paywall.js";
import { TransportError } from "../../domain/errors/index.js";
import type { NetworkDescriptor } from "../../domain/types/index.js";
import type { DispatchCheck } from "../contracts/deadline.js";
import type {
  X402FacilitatorOffer,
  X402FacilitatorPort,
  X402OfferedRequirement,
} from "../ports/x402-facilitator.js";
import type { X402ServeInput } from "../ports/x402-server.js";

const NO_DEADLINE = new CommandDeadline(0);
const CONNECTED = new AbortController().signal;

const evm = { id: "eip155:56", family: "evm", chainId: "56" } as NetworkDescriptor;
const tron = { id: "tron:728126428", family: "tron", chainId: "728126428" } as NetworkDescriptor;
const USDT = {
  symbol: "USDT",
  address: "0x55d398326f99059fF775485246999027B3197955",
  decimals: 18,
};
const PAY_TO = "0x2222222222222222222222222222222222222222";

const assets: Pick<X402FacilitatorPort, "assetBySymbol" | "assetByAddress"> = {
  assetBySymbol: (_network, _scheme, symbol) => (symbol === "USDT" ? USDT : undefined),
  assetByAddress: (_network, _scheme, address) =>
    address.toLowerCase() === USDT.address.toLowerCase() ? USDT : undefined,
};

const input = (extra: Partial<X402ServeInput> = {}): X402ServeInput => ({
  payTo: PAY_TO,
  scheme: "exact",
  host: "127.0.0.1",
  port: 0,
  facilitatorUrl: "https://facilitator.example",
  ...extra,
});

describe("paywallTerms", () => {
  it("defaults the token, amount and validity", () => {
    expect(paywallTerms(evm, input(), assets)).toMatchObject({
      token: "USDT",
      asset: USDT.address,
      decimals: 18,
      rawAmount: "100000000000000",
      validForSeconds: 300,
    });
  });

  it("converts the amount with the asset's precision and keeps an explicit asset unlabelled", () => {
    const terms = paywallTerms(
      evm,
      input({ asset: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", decimals: 6, amount: "1.5" }),
      assets,
    );
    expect(terms).toMatchObject({ rawAmount: "1500000", decimals: 6, amount: "1.5" });
    expect(terms).not.toHaveProperty("token");
  });

  it.each([
    [{ scheme: "exact_gasfree" as const }, "invalid_value"],
    [{ amount: "1", rawAmount: "1" }, "invalid_option"],
    [{ token: "USDT", asset: USDT.address }, "invalid_option"],
    [{ decimals: 6 }, "invalid_option"],
    [{ asset: USDT.address, decimals: 6 }, "invalid_option"],
    [{ asset: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c" }, "invalid_value"],
    [{ token: "DOGE" }, "invalid_value"],
    [{ payTo: "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ" }, "family_mismatch"],
    [{ payTo: "nope" }, "invalid_address"],
    [{ validForSeconds: 86_401 }, "invalid_value"],
    [{ resourceUrl: "ftp://resource.example" }, "invalid_value"],
    [{ rawAmount: "0" }, "invalid_amount"],
    [{ amount: "0.0000000000000000001" }, "invalid_amount"],
    [{ maxGasfreeFeeRaw: "0" }, "invalid_amount"],
    [{ gasfreeRelay: "http://relay.example" }, "invalid_option"],
  ])("refuses %j before any I/O", (extra, code) => {
    expect(() => paywallTerms(evm, input(extra), assets)).toThrow(
      expect.objectContaining({ code }),
    );
  });

  it("names inputs by field for the inbound adapter to spell", () => {
    expect(() => paywallTerms(evm, input({ payTo: "nope" }), assets)).toThrow(
      expect.objectContaining({ message: "invalid EVM payTo address" }),
    );
  });

  it("allows exact_gasfree where the family supports it", () => {
    expect(
      paywallTerms(
        tron,
        input({ scheme: "exact_gasfree", payTo: "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ" }),
        assets,
      ),
    ).toMatchObject({ scheme: "exact_gasfree" });
  });
});

describe("handling a payment request", () => {
  const requirement: X402OfferedRequirement = {
    scheme: "exact",
    network: "eip155:56",
    amount: "100000000000000",
    asset: USDT.address,
    payTo: PAY_TO,
    maxTimeoutSeconds: 300,
    extra: { assetTransferMethod: "permit2" },
  };

  async function open(
    offer: Partial<X402FacilitatorOffer> = {},
    requests = sharedRequestDeadline(NO_DEADLINE),
  ) {
    const full: X402FacilitatorOffer = {
      requirement,
      encodeChallenge: vi.fn(() => "encoded-challenge"),
      verify: vi.fn(async () => ({ accepted: true as const })),
      settle: vi.fn(async () => ({
        accepted: true as const,
        transaction: "0xtx",
        receiptHeader: "encoded-receipt",
      })),
      ...offer,
    };
    const facilitator = { offer: vi.fn(async () => full) };
    const paywall = await new Paywall(
      facilitator,
      paywallTerms(evm, input(), assets),
      requests,
    ).open(NO_DEADLINE);
    const details = paywall.publish("http://127.0.0.1:4020/pay");
    return { paywall, details, offer: full, facilitator };
  }

  it("publishes details and discovery at the listening URL", async () => {
    const { paywall, details } = await open();
    expect(details).toMatchObject({
      payUrl: "http://127.0.0.1:4020/pay",
      resourceUrl: "http://127.0.0.1:4020/pay",
      network: "eip155:56",
      token: "USDT",
      rawAmount: "100000000000000",
    });
    expect(paywall.discovery()).toEqual({
      x402Version: 2,
      resource: { url: "http://127.0.0.1:4020/pay" },
      accepts: [requirement],
    });
  });

  it("challenges a request without a payment signature", async () => {
    const { paywall, offer } = await open();
    await expect(paywall.handlePaymentRequest(undefined, CONNECTED)).resolves.toEqual({
      kind: "payment-required",
      challengeHeader: "encoded-challenge",
      challenge: {
        x402Version: 2,
        error: "Payment required",
        resource: { url: "http://127.0.0.1:4020/pay" },
        accepts: [requirement],
      },
    });
    expect(offer.verify).not.toHaveBeenCalled();
  });

  it("verifies, then settles, then reports the paid transaction", async () => {
    const { paywall, offer } = await open();
    await expect(paywall.handlePaymentRequest("sig", CONNECTED)).resolves.toEqual({
      kind: "paid",
      receiptHeader: "encoded-receipt",
      body: { success: true, network: "eip155:56", scheme: "exact", transaction: "0xtx" },
    });
    expect(offer.verify).toHaveBeenCalledWith("sig", expect.anything());
    expect(offer.settle).toHaveBeenCalledWith("sig", expect.anything());
  });

  it("never settles a payment the facilitator did not verify", async () => {
    const error = new TransportError("insufficient_balance", "no funds");
    const { paywall, offer } = await open({
      verify: vi.fn(async () => ({ accepted: false as const, rejected: true, error })),
    });
    await expect(paywall.handlePaymentRequest("sig", CONNECTED)).resolves.toEqual({
      kind: "refused",
      phase: "verify",
      rejected: true,
      error,
    });
    expect(offer.settle).not.toHaveBeenCalled();
  });

  it("reports a failed settlement with its phase", async () => {
    const error = new TransportError("provider_error", "down");
    const { paywall } = await open({
      settle: vi.fn(async () => ({ accepted: false as const, rejected: false, error })),
    });
    await expect(paywall.handlePaymentRequest("sig", CONNECTED)).resolves.toMatchObject({
      kind: "refused",
      phase: "settle",
      rejected: false,
      error,
    });
  });

  describe("under per-request deadlines", () => {
    afterEach(() => vi.useRealTimers());

    const NOT_SETTLED = { phase: "settle", paymentStatus: "not_sent", retryPayment: false };

    function gate() {
      let open!: () => void;
      const opened = new Promise<void>((resolve) => (open = resolve));
      return { opened, open };
    }

    it("gives each request its own deadline and settles none that ran out", async () => {
      vi.useFakeTimers();
      const slow = gate();
      const checks: DispatchCheck[] = [];
      const verify = vi.fn(async (signature: string, check: DispatchCheck) => {
        checks.push(check);
        if (signature === "slow") await slow.opened;
        return { accepted: true as const };
      });
      const settle = vi.fn(async () => ({
        accepted: true as const,
        transaction: "0xtx",
        receiptHeader: "encoded-receipt",
      }));
      const { paywall } = await open({ verify, settle }, freshRequestDeadlines(5000));
      const first = paywall.handlePaymentRequest("slow", CONNECTED);
      await vi.advanceTimersByTimeAsync(4000);
      // Started 4 s after the first, the second still has its full 5 s.
      await expect(paywall.handlePaymentRequest("fast", CONNECTED)).resolves.toMatchObject({
        kind: "paid",
      });
      await vi.advanceTimersByTimeAsync(1000);
      expect(checks[0]!.signal.aborted).toBe(true);
      expect(checks[1]!.signal.aborted).toBe(false);
      slow.open();
      await expect(first).resolves.toMatchObject({
        kind: "refused",
        phase: "settle",
        rejected: false,
        error: { code: "timeout", details: NOT_SETTLED },
      });
      expect(settle).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("does not start settlement with less than the admission reserve left", async () => {
      vi.useFakeTimers();
      const slow = gate();
      const { paywall, offer } = await open(
        {
          verify: vi.fn(async () => {
            await slow.opened;
            return { accepted: true as const };
          }),
        },
        freshRequestDeadlines(3000),
      );
      const pending = paywall.handlePaymentRequest("sig", CONNECTED);
      await vi.advanceTimersByTimeAsync(1001);
      slow.open();
      await expect(pending).resolves.toMatchObject({
        kind: "refused",
        phase: "settle",
        error: { code: "timeout", details: NOT_SETTLED },
      });
      expect(offer.settle).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("admits settlement at exactly the admission reserve", async () => {
      vi.useFakeTimers();
      const slow = gate();
      const { paywall, offer } = await open(
        {
          verify: vi.fn(async () => {
            await slow.opened;
            return { accepted: true as const };
          }),
        },
        freshRequestDeadlines(3000),
      );
      const pending = paywall.handlePaymentRequest("sig", CONNECTED);
      await vi.advanceTimersByTimeAsync(1000);
      slow.open();
      await expect(pending).resolves.toMatchObject({ kind: "paid" });
      expect(offer.settle).toHaveBeenCalledOnce();
    });

    it("stops verification when the client disconnects and never settles", async () => {
      const client = new AbortController();
      const { paywall, offer } = await open({
        verify: vi.fn(
          (_signature: string, check: DispatchCheck) =>
            new Promise<never>((_resolve, reject) =>
              check.signal.addEventListener("abort", () => reject(check.signal.reason)),
            ),
        ),
      });
      const pending = paywall.handlePaymentRequest("sig", client.signal);
      client.abort();
      await expect(pending).rejects.toBeDefined();
      expect(offer.settle).not.toHaveBeenCalled();
    });

    it("refuses settlement for a client that disconnected after verification", async () => {
      const client = new AbortController();
      const { paywall, offer } = await open({
        verify: vi.fn(async () => {
          client.abort();
          return { accepted: true as const };
        }),
      });
      await expect(paywall.handlePaymentRequest("sig", client.signal)).resolves.toMatchObject({
        kind: "refused",
        phase: "settle",
        error: { code: "aborted", details: NOT_SETTLED },
      });
      expect(offer.settle).not.toHaveBeenCalled();
    });

    it("lets a dispatched settlement finish after the client disconnects", async () => {
      vi.useFakeTimers();
      const client = new AbortController();
      const reply = gate();
      let settleCheck: DispatchCheck | undefined;
      const { paywall } = await open(
        {
          settle: vi.fn(async (_signature: string, check: DispatchCheck) => {
            settleCheck = check;
            await reply.opened;
            return { accepted: true as const, transaction: "0xtx", receiptHeader: "r" };
          }),
        },
        freshRequestDeadlines(60_000),
      );
      const pending = paywall.handlePaymentRequest("sig", client.signal);
      await vi.advanceTimersByTimeAsync(0);
      client.abort();
      expect(settleCheck!.signal.aborted).toBe(false);
      reply.open();
      await expect(pending).resolves.toMatchObject({ kind: "paid" });
      expect(vi.getTimerCount()).toBe(0);
    });

    it("ends a dispatched settlement of a disconnected client at the request deadline", async () => {
      vi.useFakeTimers();
      const client = new AbortController();
      let settleCheck: DispatchCheck | undefined;
      const { paywall } = await open(
        {
          // Rejects only when its signal aborts, as the facilitator's fetch does.
          settle: vi.fn(
            (_signature: string, check: DispatchCheck) =>
              new Promise<never>((_resolve, reject) => {
                settleCheck = check;
                check.signal.addEventListener("abort", () =>
                  reject(new TransportError("timeout", "settlement timed out")),
                );
              }),
          ),
        },
        freshRequestDeadlines(60_000),
      );
      const pending = paywall.handlePaymentRequest("sig", client.signal);
      const outcome = expect(pending).rejects.toMatchObject({ code: "timeout" });
      await vi.advanceTimersByTimeAsync(0);
      client.abort();
      await vi.advanceTimersByTimeAsync(59_999);
      expect(settleCheck!.signal.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await outcome;
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
