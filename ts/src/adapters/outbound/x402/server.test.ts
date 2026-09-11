import { describe, expect, it } from "vitest";
import { toSmallestUnit } from "./server.js";

describe("x402 server amount conversion", () => {
  it("converts without floating point loss", () => {
    expect(toSmallestUnit("1.000001", 6)).toBe("1000001");
    expect(() => toSmallestUnit("0.0000001", 6)).toThrow(/at most 6/);
  });
});

import { X402HttpServer } from "./server.js";
import { createServer } from "node:net";
import { request } from "node:http";
import type { NetworkDescriptor } from "../../../domain/types/index.js";

async function withServer(
  settlement: object,
  run: (port: number) => Promise<void>,
  fetcher?: typeof fetch,
) {
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const server = new X402HttpServer(
    fetcher ??
      (async (url) =>
        Response.json(String(url).endsWith("/verify") ? { isValid: true } : settlement)),
  );
  const handle = await server.start(
    { id: "tron:3448148188", family: "tron", chainId: "3448148188" } as NetworkDescriptor,
    {
      host: "127.0.0.1",
      port,
      payTo: "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ",
      amount: "0.01",
      token: "USDT",
      scheme: "exact",
      facilitatorUrl: "https://fake.invalid",
    },
  );
  try {
    await run(port);
  } finally {
    await handle.close();
  }
}

it("rejects malformed request URLs and keeps serving health requests", async () => {
  await withServer({}, async (port) => {
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = request({ hostname: "127.0.0.1", port, path: "//[" }, (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode));
      });
      req.on("error", reject);
      req.end();
    });
    expect(status).toBe(400);
    expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(200);
  });
});

it.each([
  [{ success: true, transaction: "", network: "tron:0xcd8690dc" }, 502],
  [{ success: true, transaction: "a".repeat(64), network: "eip155:1" }, 502],
  [{ success: true, transaction: "garbage", network: "tron:0xcd8690dc" }, 502],
  [{ success: false, transaction: "a".repeat(64), network: "tron:0xcd8690dc" }, 502],
  [{ success: true, transaction: "a".repeat(64), network: "tron:0xcd8690dc" }, 200],
])("validates facilitator settlement %j", async (settlement, status) => {
  await withServer(settlement, async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/pay`, {
      headers: {
        "payment-signature": Buffer.from(JSON.stringify({ x402Version: 2, payload: {} })).toString(
          "base64",
        ),
      },
    });
    expect(response.status).toBe(status);
    expect(response.headers.has("payment-response")).toBe(status === 200);
    await response.arrayBuffer();
  });
});

it.each([
  ["permit2_allowance_required", "permit2_allowance_required"],
  ["insufficient_funds", "insufficient_balance"],
  ["SECRET", "provider_error"],
])("keeps known settlement reasons and redacts unknown text: %s", async (reason, code) => {
  await withServer(
    { success: false, errorReason: reason, errorMessage: "SECRET" },
    async (port) => {
      const response = await fetch(`http://127.0.0.1:${port}/pay`, {
        headers: {
          "payment-signature": Buffer.from(
            JSON.stringify({ x402Version: 2, payload: {} }),
          ).toString("base64"),
        },
      });
      const body = await response.json();
      expect(body).toMatchObject({ code, phase: "settle" });
      expect(JSON.stringify(body)).not.toContain("SECRET");
    },
  );
});

it("retains a failed settlement candidate hash through the local paywall", async () => {
  await withServer(
    {
      success: false,
      errorReason: "invalid_transaction_state",
      transaction: "a".repeat(64),
      network: "tron:0xcd8690dc",
    },
    async (port) => {
      const response = await fetch(`http://127.0.0.1:${port}/pay`, {
        headers: {
          "payment-signature": Buffer.from(
            JSON.stringify({ x402Version: 2, payload: {} }),
          ).toString("base64"),
        },
      });
      expect(response.status).toBe(502);
      expect(await response.json()).toMatchObject({
        phase: "settle",
        reason: "invalid_transaction_state",
        candidateTxHash: "a".repeat(64),
        candidateNetwork: "tron:0xcd8690dc",
        retryPayment: false,
      });
      expect(response.headers.has("payment-response")).toBe(false);
    },
  );
});

it.each(["verify", "settle"])("preserves connection diagnostics during %s", async (phase) => {
  for (const code of ["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "SECRET"]) {
    await withServer(
      {},
      async (port) => {
        const response = await fetch(`http://127.0.0.1:${port}/pay`, {
          headers: {
            "payment-signature": Buffer.from(
              JSON.stringify({ x402Version: 2, payload: {} }),
            ).toString("base64"),
          },
        });
        const body = await response.json();
        expect(response.status).toBe(502);
        expect(body).toMatchObject({
          code: "provider_error",
          phase,
          paymentStatus: "unknown",
          retryPayment: false,
        });
        if (code === "SECRET") expect(body).not.toHaveProperty("transportCode");
        else expect(body).toMatchObject({ reason: "connection_failed", transportCode: code });
        expect(JSON.stringify(body)).not.toContain("SECRET");
        expect(response.headers.has("payment-response")).toBe(false);
      },
      async (url) => {
        if (String(url).endsWith(`/${phase}`)) {
          throw new TypeError("SECRET URL and credentials", { cause: { code } });
        }
        return Response.json({ isValid: true });
      },
    );
  }
});
