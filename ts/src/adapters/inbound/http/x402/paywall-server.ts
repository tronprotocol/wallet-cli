import { createServer, type Server, type ServerResponse } from "node:http";
import { ExecutionError } from "../../../../domain/errors/index.js";
import type {
  X402ListenOptions,
  X402Paywall,
  X402PaywallHost,
  X402PaywallResponse,
} from "../../../../application/contracts/x402-paywall.js";
import type { X402ServerHandle } from "../../../../application/ports/x402-server.js";

const ROUTES = ["/health", "/.well-known/x402", "/pay"];

// Serves one paywall over loopback HTTP: /health, /.well-known/x402 and /pay.
export class X402PaywallHttpServer implements X402PaywallHost {
  constructor(
    // Persistent access log lines.
    private readonly log: (line: string) => void,
    // Diagnostic lines, shown only when diagnostics are enabled.
    private readonly debugLog: (line: string) => void,
  ) {}

  async start(paywall: X402Paywall, options: X402ListenOptions): Promise<X402ServerHandle> {
    const open = await paywall.open();
    const host = options.host.includes(":") ? `[${options.host}]` : options.host;
    let base = `http://${host}:${options.port}`;
    const server = createServer(async (request, response) => {
      const started = performance.now();
      response.once("finish", () => {
        this.#access(options, request.method, request.url, response.statusCode, started);
      });
      let pathname: string;
      try {
        pathname = new URL(request.url ?? "/", base).pathname;
      } catch {
        return json(response, 400, { error: "invalid request URL" });
      }
      if (pathname === "/health") return json(response, 200, { ok: true });
      if (pathname === "/.well-known/x402" && request.method === "GET")
        return json(response, 200, open.discovery());
      if (pathname !== "/pay") return json(response, 404, { error: "not found" });
      const signature = request.headers["payment-signature"];
      const paymentSignature = typeof signature === "string" && signature ? signature : undefined;
      return respond(response, await open.handlePaymentRequest(paymentSignature));
    });
    await listen(server, options.host, options.port);
    const address = server.address();
    if (address && typeof address === "object") base = `http://${host}:${address.port}`;
    return { details: open.publish(`${base}/pay`), close: () => close(server) };
  }

  // Never logs URLs, queries, headers, bodies or payment signatures.
  #access(
    options: X402ListenOptions,
    method: string | undefined,
    url: string | undefined,
    status: number,
    started: number,
  ): void {
    const path = (url ?? "").split("?")[0]!;
    const route = ROUTES.includes(path) ? path : "other";
    const durationMs = Math.round(performance.now() - started);
    const description =
      status === 402
        ? "Payment required"
        : status === 200
          ? "Request completed"
          : "Request finished";
    const message = `${description}: HTTP ${status} (${durationMs} ms)`;
    if (options.accessLog === "diagnostic") this.debugLog(message);
    else if (options.accessLog === "text") this.log(message);
    else this.log(JSON.stringify({ event: "x402.request", method, route, status, durationMs }));
  }
}

function respond(response: ServerResponse, outcome: X402PaywallResponse): void {
  switch (outcome.kind) {
    case "payment-required":
      // Signing can outlast keepAliveTimeout; the paid retry needs a fresh socket.
      response.setHeader("connection", "close");
      response.setHeader("payment-required", outcome.challengeHeader);
      return json(response, 402, outcome.challenge);
    case "paid":
      response.setHeader("payment-response", outcome.receiptHeader);
      return json(response, 200, outcome.body);
    case "refused": {
      const { error } = outcome;
      const status = outcome.phase === "verify" && outcome.rejected ? 400 : 502;
      return json(response, status, { code: error.code, error: error.message, ...error.details });
    }
  }
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function listen(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) =>
      reject(
        error.code === "EADDRINUSE"
          ? new ExecutionError("port_in_use", "x402 server port is already in use")
          : error,
      );
    server.once("error", onError);
    server.listen(port, host, () => {
      server.off("error", onError);
      resolve();
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
