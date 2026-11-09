import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CommandDeadline,
  requestDispatchCheck,
} from "../../../application/services/command-deadline.js";
import { X402FacilitatorClient } from "./facilitator-client.js";

const CHECK = requestDispatchCheck(new CommandDeadline(0));

async function offerAnswering(response: () => Response) {
  return new X402FacilitatorClient(async () => response()).offer(
    {
      network: { id: "eip155:8453", family: "evm", chainId: "8453" },
      scheme: "exact",
      asset: `0x${"1".repeat(40)}`,
      rawAmount: "1",
      payTo: `0x${"2".repeat(40)}`,
      validForSeconds: 60,
      facilitatorUrl: "https://facilitator.example",
    } as never,
    CHECK,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe.each(["verify", "settle"] as const)("facilitator %s rate limit", (phase) => {
  it.each([
    ["12", 12],
    ["Mon, 02 Nov 2026 00:00:30 GMT", 30],
  ])("keeps the Retry-After hint %j", async (header, seconds) => {
    vi.useFakeTimers({ now: Date.parse("2026-11-02T00:00:00Z"), toFake: ["Date"] });
    const offer = await offerAnswering(
      () => new Response("{}", { status: 429, headers: { "retry-after": header } }),
    );
    const signature = Buffer.from(
      JSON.stringify({ x402Version: 2, payload: {}, accepted: offer.requirement }),
    ).toString("base64");

    const result = await offer[phase](signature, CHECK);

    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.error.code).toBe("provider_rate_limited");
    expect(result.error.details).toMatchObject({
      phase,
      paymentStatus: "unknown",
      outcome: "unknown",
      retryPayment: false,
      httpStatus: 429,
      retryAfterSeconds: seconds,
    });
  });
});

it("does not take a Retry-After hint from a settlement body", async () => {
  const offer = await offerAnswering(() =>
    Response.json({ success: false, httpStatus: 429, retryAfterSeconds: 99 }),
  );
  const signature = Buffer.from(
    JSON.stringify({ x402Version: 2, payload: {}, accepted: offer.requirement }),
  ).toString("base64");

  const result = await offer.settle(signature, CHECK);

  expect(result.accepted).toBe(false);
  if (result.accepted) return;
  expect(result.error.code).toBe("provider_rate_limited");
  expect(result.error.details).not.toHaveProperty("retryAfterSeconds");
});
