import { CommandDeadline } from "../../../../application/services/command-deadline.js";
import { expect, it, vi } from "vitest";
import { createServer } from "node:net";
import { request } from "node:http";
import { X402PaywallHttpServer } from "./paywall-server.js";
import { X402FacilitatorClient } from "../../../outbound/x402/facilitator-client.js";
import {
  Paywall,
  paywallTerms,
  sharedRequestDeadline,
} from "../../../../application/use-cases/x402-paywall.js";
import type { X402ServeInput } from "../../../../application/ports/x402-server.js";
import type { NetworkDescriptor } from "../../../../domain/types/index.js";

const NO_DEADLINE = new CommandDeadline(0);
const UNBOUNDED = sharedRequestDeadline(NO_DEADLINE);

// The production stack: application paywall, outbound facilitator client, this HTTP host.
async function startPaywall(
  network: NetworkDescriptor,
  input: X402ServeInput,
  fetcher?: typeof fetch,
  log: (line: string) => void = () => {},
) {
  const facilitator = new X402FacilitatorClient(fetcher);
  const paywall = new Paywall(facilitator, paywallTerms(network, input, facilitator), UNBOUNDED);
  return new X402PaywallHttpServer(log, () => {}).start(
    paywall,
    {
      host: input.host,
      port: input.port,
      accessLog: "json",
      daemon: false,
      persistent: true,
    },
    NO_DEADLINE,
  );
}

async function withServer(
  settlement: object,
  run: (port: number) => Promise<void>,
  fetcher?: typeof fetch,
  scheme: "exact" | "exact_gasfree" = "exact",
) {
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const facilitator: typeof fetch = async (url, init) => {
    if (String(url).endsWith("/supported"))
      return Response.json({ kinds: [{ x402Version: 2, scheme, network: "tron:0xcd8690dc" }] });
    return fetcher
      ? fetcher(url, init)
      : Response.json(String(url).endsWith("/verify") ? { isValid: true } : settlement);
  };
  const handle = await startPaywall(
    { id: "tron:3448148188", family: "tron", chainId: "3448148188" } as NetworkDescriptor,
    {
      host: "127.0.0.1",
      port,
      payTo: "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ",
      amount: "0.01",
      token: "USDT",
      scheme,
      facilitatorUrl: "https://fake.invalid",
    },
    facilitator,
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

it("closes the connection after a 402 challenge so the paid retry cannot reuse a stale socket", async () => {
  await withServer({}, async (port) => {
    const response = await new Promise<{ status?: number; connection?: string }>(
      (resolve, reject) => {
        const req = request({ hostname: "127.0.0.1", port, path: "/pay" }, (res) => {
          res.resume();
          res.on("end", () =>
            resolve({ status: res.statusCode, connection: res.headers.connection }),
          );
        });
        req.on("error", reject);
        req.end();
      },
    );
    expect(response).toEqual({ status: 402, connection: "close" });
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
      const body = (await response.json()) as { accepts: Array<Record<string, unknown>> };
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
        const body = (await response.json()) as { accepts: Array<Record<string, unknown>> };
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

it("publishes discovery from the same payment requirement", async () => {
  await withServer({}, async (port) => {
    const challenge = (await (await fetch(`http://127.0.0.1:${port}/pay`)).json()) as {
      resource: unknown;
      accepts: unknown;
    };
    const discovery = await (await fetch(`http://127.0.0.1:${port}/.well-known/x402`)).json();
    expect(discovery).toEqual({
      x402Version: 2,
      resource: challenge.resource,
      accepts: challenge.accepts,
    });
  });
});
it("reports a port collision without stopping the first server", async () => {
  await withServer({}, async (port) => {
    await expect(
      startPaywall({ id: "eip155:84532", family: "evm", chainId: "84532" } as NetworkDescriptor, {
        host: "127.0.0.1",
        port,
        amount: "1",
        token: "USDC",
        scheme: "exact",
        payTo: "0x1111111111111111111111111111111111111111",
        facilitatorUrl: "https://example.test",
      }),
    ).rejects.toMatchObject({ code: "port_in_use" });
    expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(200);
  });
});

it("advertises legacy-compatible TRON wire IDs and an empty GasFree extra", async () => {
  await withServer(
    {},
    async (port) => {
      const response = await fetch(`http://127.0.0.1:${port}/.well-known/x402`);
      const body = (await response.json()) as { accepts: Array<Record<string, unknown>> };
      expect(body.accepts[0]).toMatchObject({
        network: "tron:0xcd8690dc",
        scheme: "exact_gasfree",
        extra: {},
      });
      expect(body.accepts[0]!.extra).toEqual({});
    },
    undefined,
    "exact_gasfree",
  );
});

it("serves raw amounts, explicit registered assets and validity, with sanitized access logs", async () => {
  const logs: string[] = [];
  const net = { id: "eip155:84532", family: "evm", chainId: "84532" } as NetworkDescriptor;
  const input = {
    host: "127.0.0.1",
    port: 0,
    payTo: "0x1111111111111111111111111111111111111111",
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    decimals: 6,
    rawAmount: "1000001",
    validForSeconds: 60,
    scheme: "exact" as const,
    resourceUrl: "https://resource.example/pay",
    facilitatorUrl: "https://fake.invalid",
  };
  const handle = await startPaywall(net, input, undefined, (line) => logs.push(line));
  try {
    const base = String(handle.details.payUrl).replace(/\/pay$/, "");
    for (const path of ["/health", "/.well-known/x402", "/pay", "/secret-path"]) {
      const response = await fetch(`${base}${path}?secret=never-log`, {
        headers: { Authorization: "never-log" },
      });
      const body = await response.json();
      if (path === "/pay")
        expect(body).toMatchObject({
          resource: { url: input.resourceUrl },
          accepts: [{ amount: "1000001", maxTimeoutSeconds: 60, asset: input.asset }],
        });
    }
    expect(logs.map((line) => JSON.parse(line).status)).toEqual([200, 200, 402, 404]);
    expect(logs.join("")).not.toMatch(/never-log|secret-path|Authorization/);
  } finally {
    await handle.close();
  }
});

it("answers a refused verification with 400 and a failed one with 502", async () => {
  for (const [verify, status] of [
    [async () => Response.json({ isValid: false, invalidReason: "insufficient_funds" }), 400],
    [async () => Response.json({}, { status: 500 }), 502],
  ] as const) {
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
        expect(response.status).toBe(status);
        expect(await response.json()).toMatchObject({ phase: "verify" });
      },
      verify,
    );
  }
});

it("logs text and diagnostic access lines through the supplied sinks", async () => {
  const facilitator = new X402FacilitatorClient(undefined);
  const net = { id: "eip155:84532", family: "evm", chainId: "84532" } as NetworkDescriptor;
  const input = {
    host: "127.0.0.1",
    port: 0,
    payTo: "0x1111111111111111111111111111111111111111",
    token: "USDC",
    scheme: "exact" as const,
    facilitatorUrl: "https://fake.invalid",
  };
  for (const accessLog of ["text", "diagnostic"] as const) {
    const lines: string[] = [];
    const debug: string[] = [];
    const paywall = new Paywall(facilitator, paywallTerms(net, input, facilitator), UNBOUNDED);
    const handle = await new X402PaywallHttpServer(
      (line) => lines.push(line),
      (line) => debug.push(line),
    ).start(
      paywall,
      {
        host: "127.0.0.1",
        port: 0,
        accessLog,
        daemon: false,
        persistent: true,
      },
      NO_DEADLINE,
    );
    try {
      await (await fetch(handle.details.payUrl)).arrayBuffer();
    } finally {
      await handle.close();
    }
    const written = accessLog === "text" ? lines : debug;
    expect(written).toEqual([expect.stringMatching(/^Payment required: HTTP 402 \(\d+ ms\)$/)]);
    expect(accessLog === "text" ? debug : lines).toEqual([]);
  }
});

const TRON_NILE = {
  id: "tron:3448148188",
  family: "tron",
  chainId: "3448148188",
} as NetworkDescriptor;
const NILE_INPUT: X402ServeInput = {
  host: "127.0.0.1",
  port: 0,
  payTo: "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ",
  amount: "0.01",
  token: "USDT",
  scheme: "exact",
  facilitatorUrl: "https://fake.invalid",
};
const SIGNATURE = Buffer.from(JSON.stringify({ x402Version: 2, payload: {} })).toString("base64");
const SUPPORTED = { kinds: [{ x402Version: 2, scheme: "exact", network: "tron:0xcd8690dc" }] };
const SETTLED = { success: true, transaction: "a".repeat(64), network: "tron:0xcd8690dc" };

function hostWith(fetcher: typeof fetch, startup: CommandDeadline) {
  const facilitator = new X402FacilitatorClient(fetcher);
  const paywall = new Paywall(
    facilitator,
    paywallTerms(TRON_NILE, NILE_INPUT, facilitator),
    UNBOUNDED,
  );
  return new X402PaywallHttpServer(
    () => {},
    () => {},
  ).start(
    paywall,
    { host: "127.0.0.1", port: 0, accessLog: "json", daemon: false, persistent: true },
    startup,
  );
}

async function freePort(): Promise<number> {
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  return port;
}

it("closes the listener and fails with timeout when it is ready after the start-up deadline", async () => {
  let now = 0;
  const startup = new CommandDeadline(1000, 0, { now: () => now });
  const port = await freePort();
  const facilitator = new X402FacilitatorClient(async () => {
    // The clock passes the limit before the timer fires.
    now = 1001;
    return Response.json(SUPPORTED);
  });
  const paywall = new Paywall(
    facilitator,
    paywallTerms(TRON_NILE, NILE_INPUT, facilitator),
    UNBOUNDED,
  );
  await expect(
    new X402PaywallHttpServer(
      () => {},
      () => {},
    ).start(
      paywall,
      { host: "127.0.0.1", port, accessLog: "json", daemon: false, persistent: true },
      startup,
    ),
  ).rejects.toMatchObject({ code: "timeout" });
  startup.dispose();
  await expect(fetch(`http://127.0.0.1:${port}/health`)).rejects.toThrow();
});

it("never listens when the start-up deadline has run out", async () => {
  const startup = new CommandDeadline(1);
  await new Promise((resolve) => setTimeout(resolve, 5));
  const fetcher = vi.fn(async () => Response.json(SUPPORTED));
  await expect(hostWith(fetcher, startup)).rejects.toMatchObject({ code: "timeout" });
  expect(fetcher).not.toHaveBeenCalled();
});

it("finishes a settlement whose client disconnected and keeps serving", async () => {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let settled!: () => void;
  const settledOnce = new Promise<void>((resolve) => (settled = resolve));
  let settleSignal: AbortSignal | undefined;
  const handle = await hostWith(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === "/supported") return Response.json(SUPPORTED);
    if (path === "/verify") return Response.json({ isValid: true });
    settleSignal = init?.signal ?? undefined;
    settled();
    await released;
    return Response.json(SETTLED);
  }, NO_DEADLINE);
  try {
    const client = new AbortController();
    const paid = fetch(handle.details.payUrl, {
      headers: { "payment-signature": SIGNATURE },
      signal: client.signal,
    });
    await settledOnce;
    client.abort();
    await expect(paid).rejects.toThrow();
    // Give the server a turn to see the closed socket.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settleSignal?.aborted).toBe(false);
    release();
    expect((await fetch(handle.details.payUrl.replace(/\/pay$/, "/health"))).status).toBe(200);
  } finally {
    release();
    await handle.close();
  }
});

it("closes promptly with a request in flight and an idle keep-alive connection", async () => {
  let verifying!: () => void;
  const verifyStarted = new Promise<void>((resolve) => (verifying = resolve));
  const handle = await hostWith(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === "/supported") return Response.json(SUPPORTED);
    verifying();
    // Answers only when its request is aborted.
    return new Promise<Response>((_resolve, reject) =>
      init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)),
    );
  }, NO_DEADLINE);
  const health = handle.details.payUrl.replace(/\/pay$/, "/health");
  await (await fetch(health)).arrayBuffer();
  const inFlight = fetch(handle.details.payUrl, { headers: { "payment-signature": SIGNATURE } });
  await verifyStarted;
  const started = performance.now();
  await handle.close();
  expect(performance.now() - started).toBeLessThan(1000);
  await expect(inFlight).rejects.toThrow();
});
