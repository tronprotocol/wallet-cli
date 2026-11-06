import { expect, it } from "vitest";
import { CommandDeadline } from "../application/services/command-deadline.js";
import {
  Paywall,
  paywallTerms,
  freshRequestDeadlines,
} from "../application/use-cases/x402-paywall.js";
import { X402PaywallHttpServer } from "../adapters/inbound/http/x402/paywall-server.js";
import { X402FacilitatorClient } from "../adapters/outbound/x402/facilitator-client.js";
import type { NetworkDescriptor } from "../domain/types/index.js";
import { ManagedX402Server } from "./x402-server-lifecycle.js";
import { ProcessLifetime } from "./process-lifetime.js";

const NILE = { id: "tron:3448148188", family: "tron", chainId: "3448148188" } as NetworkDescriptor;
const SIGNATURE = Buffer.from(JSON.stringify({ x402Version: 2, payload: {} })).toString("base64");

it("keeps a foreground server answering paid requests after its start-up deadline would have expired", async () => {
  const facilitator = new X402FacilitatorClient(async (url) => {
    const path = new URL(String(url)).pathname;
    if (path === "/supported")
      return Response.json({
        kinds: [{ x402Version: 2, scheme: "exact", network: "tron:0xcd8690dc" }],
      });
    if (path === "/verify") return Response.json({ isValid: true });
    return Response.json({
      success: true,
      transaction: "a".repeat(64),
      network: "tron:0xcd8690dc",
    });
  });
  const terms = paywallTerms(
    NILE,
    {
      host: "127.0.0.1",
      port: 0,
      payTo: "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ",
      amount: "0.01",
      token: "USDT",
      scheme: "exact",
      facilitatorUrl: "https://fake.invalid",
    },
    facilitator,
  );
  const startup = new CommandDeadline(300);
  const lifetime = new ProcessLifetime(startup);
  const host = new ManagedX402Server(
    new X402PaywallHttpServer(
      () => {},
      () => {},
    ),
    async () => {
      throw new Error("no daemon here");
    },
    lifetime,
    5000,
  );
  const handle = await host.start(
    new Paywall(facilitator, terms, freshRequestDeadlines(5000)),
    { host: "127.0.0.1", port: 0, accessLog: "json", daemon: false, persistent: true },
    startup,
  );
  try {
    expect(lifetime.longLived).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(startup.expired()).toBe(false);
    const response = await fetch(handle.details.payUrl, {
      headers: { "payment-signature": SIGNATURE },
    });
    expect(response.status).toBe(200);
    await response.arrayBuffer();
  } finally {
    await handle.close();
    startup.dispose();
  }
});
